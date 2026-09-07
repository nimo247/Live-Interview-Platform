const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

// Exercise the production TypeScript without adding a test runtime dependency.
function load(relativePath, globals = {}, dependencies = {}) {
  const filename = resolve(__dirname, '..', relativePath)
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  })
  const module = { exports: {} }
  vm.runInNewContext(outputText, {
    module, exports: module.exports, process: { env: {} }, AbortSignal,
    require: name => { if (dependencies[name]) return dependencies[name]; throw new Error('Unexpected dependency: ' + name) },
    ...globals,
  }, { filename })
  return module.exports
}

test('room codes match the backend format and reject invalid paths', () => {
  const { normalizeRoomCode } = load('src/lib/rooms.ts')
  assert.equal(normalizeRoomCode(' a1b2c3d4 '), 'A1B2C3D4')
  for (const value of ['', 'XC-921', '../rooms', 'A1B2C3D!', 'ABCDEFGHI', 'ABCD EF1']) {
    assert.equal(normalizeRoomCode(value), null)
  }
})

test('room creation uses the actual returned code', async () => {
  let request
  const { createRoom } = load('src/lib/rooms.ts', {
    fetch: async (url, options) => {
      request = { url, options }
      return { ok: true, json: async () => ({ room_id: 'ABCD1234' }) }
    },
  })
  assert.equal(await createRoom(), 'ABCD1234')
  assert.equal(request.url, 'http://localhost:8000/rooms/create')
  assert.equal(request.options.method, 'POST')
})

test('failed or malformed creation never navigates to an undefined room', async () => {
  for (const response of [
    { ok: false, json: async () => ({ room_id: 'ABCD1234' }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ room_id: '../bad' }) },
    { ok: true, json: async () => { throw new Error('Invalid JSON') } },
  ]) {
    const { createRoom } = load('src/lib/rooms.ts', { fetch: async () => response })
    await assert.rejects(createRoom())
  }
})

test('network errors are actionable and execution includes standard input', async () => {
  const unavailable = load('src/lib/rooms.ts', { fetch: async () => { throw new Error('Network down') } })
  await assert.rejects(unavailable.roomRequest('create'), /unavailable/)
  let payload
  const api = load('src/lib/rooms.ts', {
    fetch: async (_url, options) => {
      payload = JSON.parse(options.body)
      return { ok: true, json: async () => ({ stdout: '7', status: 'Accepted' }) }
    },
  })
  await api.roomRequest('execute', { code: 'print(input())', language: 'python', stdin: '7' })
  assert.deepEqual(payload, { code: 'print(input())', language: 'python', stdin: '7' })
})

class Track extends EventEmitter {
  constructor(kind) { super(); this.kind = kind; this.enabled = true; this.readyState = 'live'; this.stopped = false }
  addEventListener(name, fn) { this.on(name, fn) }
  stop() { this.stopped = true; this.readyState = 'ended' }
}
class Stream extends EventEmitter {
  constructor(tracks = []) { super(); this.tracks = [...tracks] }
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
  addTrack(track) { this.tracks.push(track); this.emit('addtrack') }
  addEventListener(name, fn) { this.on(name, fn) }
  removeEventListener(name, fn) { this.off(name, fn) }
}
class Peer extends EventEmitter {
  static instances = []
  static WEBRTC_SUPPORT = true
  constructor(options) { super(); this.options = options; this.tracks = []; Peer.instances.push(this) }
  addTrack(track) { this.tracks.push(track) }
  signal(data) { this.lastSignal = data }
  destroy() { this.destroyed = true; this.emit('close') }
}

function mediaHarness(mediaDevices) {
  Peer.instances = []
  const updates = []
  const errors = []
  const emitted = []
  const socket = { connected: true, emit: (event, data) => emitted.push({ event, data }) }
  const { RoomMedia } = load('src/lib/room-media.ts', {
    MediaStream: Stream, navigator: { mediaDevices }, DOMException,
  }, { 'simple-peer': Peer })
  const controller = new RoomMedia(socket, 'ABCD1234', patch => updates.push(patch), message => errors.push(message))
  return { controller, updates, errors, emitted }
}

test('media capture requires an explicit action; mute changes the actual audio track', async () => {
  const audio = new Track('audio')
  let captures = 0
  const { controller } = mediaHarness({
    getUserMedia: async () => { captures++; return new Stream([audio]) },
  })
  assert.equal(captures, 0)
  await controller.toggle('audio')
  assert.equal(captures, 1)
  assert.equal(audio.enabled, true)
  await controller.toggle('audio')
  assert.equal(audio.enabled, false)
  assert.equal(captures, 1)
  controller.dispose()
  assert.equal(audio.stopped, true)
})

test('camera toggles notify the other participant and preserve one capture', async () => {
  const video = new Track('video')
  const { controller, emitted } = mediaHarness({ getUserMedia: async () => new Stream([video]) })
  await controller.toggle('video')
  await controller.toggle('video')
  assert.equal(video.enabled, false)
  assert.deepEqual(emitted.map(item => item.event), ['video_ready', 'video_stopped'])
  controller.dispose()
  assert.equal(video.stopped, true)
})

test('leaving while permission is pending immediately stops the late stream', async () => {
  let grant
  const audio = new Track('audio')
  const { controller, updates } = mediaHarness({
    getUserMedia: () => new Promise(resolve => { grant = resolve }),
  })
  const pending = controller.toggle('audio')
  controller.dispose()
  grant(new Stream([audio]))
  await pending
  assert.equal(audio.stopped, true)
  assert.equal(updates.some(patch => patch.microphoneOn), false)
})

test('denied media permission produces a visible error and releases the busy state', async () => {
  const { controller, errors, updates } = mediaHarness({ getUserMedia: async () => { throw new Error('denied') } })
  await controller.toggle('video')
  assert.match(errors[0], /camera/)
  assert.equal(updates.at(-1).busy, false)
  controller.dispose()
})

test('screen sharing stops all tracks and informs the partner when cancelled', async () => {
  const track = new Track('video')
  const { controller, emitted, updates } = mediaHarness({ getDisplayMedia: async () => new Stream([track]) })
  await controller.startScreen()
  track.emit('ended')
  assert.equal(track.stopped, true)
  assert.ok(emitted.some(item => item.event === 'screen_stopped'))
  assert.equal(updates.at(-1).screen, null)
  controller.dispose()
})

test('media signaling uses the existing backend events with deterministic caller roles', () => {
  const { controller, emitted } = mediaHarness({})
  controller.connect(true)
  const caller = Peer.instances.at(-1)
  assert.equal(caller.options.initiator, true)
  caller.emit('signal', { type: 'offer', sdp: 'offer-sdp' })
  assert.equal(emitted.at(-1).event, 'webrtc_offer')
  assert.equal(emitted.at(-1).data.room_id, 'ABCD1234')
  controller.signal({ type: 'answer', sdp: 'answer-sdp' })
  assert.equal(caller.lastSignal.sdp, 'answer-sdp')
  controller.disconnectPeer()
  assert.equal(caller.destroyed, true)
  controller.signal({ type: 'offer', sdp: 'new-offer' })
  assert.equal(Peer.instances.at(-1).options.initiator, false)
  controller.dispose()
})
