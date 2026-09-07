import SimplePeer from 'simple-peer'
import type { Socket } from 'socket.io-client'

export interface MediaState {
  local: MediaStream | null
  remote: MediaStream | null
  screen: MediaStream | null
  remoteScreen: MediaStream | null
  cameraOn: boolean
  microphoneOn: boolean
  remoteCameraOn: boolean
  busy: boolean
}

/** Owns media resources for one mounted room; all capture starts from user actions. */
export class RoomMedia {
  private peer: SimplePeer.Instance | null = null
  private screenPeer: SimplePeer.Instance | null = null
  private local = new MediaStream()
  private remote: MediaStream | null = null
  private screen: MediaStream | null = null
  private disposed = false
  private busy = false

  constructor(
    private socket: Socket,
    private roomId: string,
    private update: (state: Partial<MediaState>) => void,
    private reportError: (message: string) => void,
  ) {}

  private emit(event: string, data: object = {}) {
    if (!this.disposed && this.socket.connected) this.socket.emit(event, { room_id: this.roomId, ...data })
  }

  connect(initiator: boolean) {
    this.disconnectPeer()
    if (this.disposed) return
    const peer = new SimplePeer({ initiator, trickle: false, stream: this.local })
    this.peer = peer
    peer.on('signal', data => {
      this.emit(data.type === 'answer' ? 'webrtc_answer' : 'webrtc_offer', { sdp: data, kind: 'video' })
    })
    peer.on('stream', stream => {
      this.remote = stream
      const refresh = () => {
        if (this.disposed || this.peer !== peer) return
        this.update({ remote: new MediaStream(stream.getTracks()), remoteCameraOn: stream.getVideoTracks().length > 0 })
      }
      stream.addEventListener('addtrack', refresh)
      stream.addEventListener('removetrack', refresh)
      refresh()
      peer.once('close', () => {
        stream.removeEventListener('addtrack', refresh)
        stream.removeEventListener('removetrack', refresh)
      })
    })
    peer.on('connect', () => {
      this.emit(this.local.getVideoTracks().some(track => track.enabled) ? 'video_ready' : 'video_stopped')
    })
    peer.on('error', () => {
      if (!this.disposed) this.reportError('The media connection failed. Rejoin the room to try again.')
    })
    peer.on('close', () => {
      if (this.peer === peer) {
        this.peer = null
        this.update({ remote: null, remoteCameraOn: false })
      }
    })
  }

  signal(data: SimplePeer.SignalData) {
    if (!this.peer) this.connect(false)
    try { this.peer?.signal(data) }
    catch { this.reportError('Could not establish the media connection. Please rejoin the room.') }
  }

  setRemoteCamera(active: boolean) {
    if (!this.disposed) this.update({ remoteCameraOn: active })
  }

  async toggle(kind: 'audio' | 'video') {
    if (this.busy || this.disposed) return
    this.busy = true
    this.update({ busy: true })
    try {
      let track = this.local.getTracks().find(item => item.kind === kind && item.readyState === 'live')
      if (track) {
        track.enabled = !track.enabled
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: kind === 'audio', video: kind === 'video' })
        if (this.disposed) { stream.getTracks().forEach(item => item.stop()); return }
        track = stream.getTracks()[0]
        this.local.addTrack(track)
        this.peer?.addTrack(track, this.local)
        track.addEventListener('ended', () => {
          if (this.disposed) return
          this.update(kind === 'video' ? { cameraOn: false } : { microphoneOn: false })
          if (kind === 'video') this.emit('video_stopped')
        })
      }
      this.update({
        local: new MediaStream(this.local.getTracks()),
        ...(kind === 'video' ? { cameraOn: track.enabled } : { microphoneOn: track.enabled }),
      })
      if (kind === 'video') this.emit(track.enabled ? 'video_ready' : 'video_stopped')
    } catch {
      this.reportError(kind === 'video'
        ? 'Could not access your camera. Check your browser permissions and try again.'
        : 'Could not access your microphone. Check your browser permissions and try again.')
    } finally {
      this.busy = false
      if (!this.disposed) this.update({ busy: false })
    }
  }

  private makeScreenPeer(initiator: boolean, stream?: MediaStream) {
    this.screenPeer?.destroy()
    const peer = new SimplePeer({ initiator, trickle: false, ...(stream ? { stream } : {}) })
    this.screenPeer = peer
    peer.on('signal', data => this.emit(data.type === 'answer' ? 'screen_answer' : 'screen_offer', { sdp: data }))
    peer.on('stream', remoteScreen => {
      if (!this.disposed) this.update({ remoteScreen })
    })
    peer.on('error', () => {
      if (!this.disposed) this.reportError('Screen sharing could not connect. Please try again.')
      this.stopScreen()
    })
    peer.on('close', () => {
      if (this.screenPeer === peer) {
        this.screenPeer = null
        if (!this.disposed) this.update({ remoteScreen: null })
      }
    })
    return peer
  }

  screenSignal(data: SimplePeer.SignalData) {
    if (data.type === 'offer' && !this.screen) this.makeScreenPeer(false)
    try { this.screenPeer?.signal(data) }
    catch { this.reportError('The shared screen could not connect. Please try again.') }
  }

  async startScreen() {
    if (this.busy || this.disposed) return
    this.busy = true
    this.update({ busy: true })
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        this.reportError('Screen sharing is not available in this browser.')
        return
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return }
      this.screen = stream
      this.update({ screen: stream })
      stream.getVideoTracks()[0].addEventListener('ended', () => this.stopScreen(), { once: true })
      this.makeScreenPeer(true, stream)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        this.reportError('Could not share your screen. Please try again.')
      }
    } finally {
      this.busy = false
      if (!this.disposed) this.update({ busy: false })
    }
  }

  stopScreen() {
    const stream = this.screen
    this.screen = null
    stream?.getTracks().forEach(track => track.stop())
    const peer = this.screenPeer
    this.screenPeer = null
    peer?.destroy()
    if (!this.disposed) this.update({ screen: null, remoteScreen: null })
    if (stream) this.emit('screen_stopped')
  }

  disconnectPeer() {
    const peer = this.peer
    this.peer = null
    peer?.destroy()
    this.remote = null
    this.stopScreen()
    if (!this.disposed) this.update({ remote: null, remoteCameraOn: false })
  }

  dispose() {
    this.disposed = true
    this.disconnectPeer()
    this.local.getTracks().forEach(track => track.stop())
  }
}
