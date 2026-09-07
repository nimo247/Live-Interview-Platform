'use client'

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Icon, type IconName } from '@/components/icon'
import { MediaVideo } from '@/components/media-video'
import { Whiteboard } from '@/components/whiteboard'
import { useRoom } from '@/hooks/use-room'
import { LANGUAGES, normalizeRoomCode, roomRequest, type RunResult } from '@/lib/rooms'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="editor-loading"><Icon name="loader" className="spin" />Loading editor…</div>,
})

export default function RoomPage() {
  return <Suspense fallback={<div className="route-error" role="status">Opening your room…</div>}><RoomRoute /></Suspense>
}

function RoomRoute() {
  const params = useParams<{ roomId: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const roomId = normalizeRoomCode(params.roomId)
  const username = search.get('username')?.trim().slice(0, 60)
  const [name, setName] = useState('')
  if (!roomId) return <main className="route-error"><h1>That room code is invalid</h1><p>Room codes contain 8 letters and numbers. Check the code with your partner.</p><a href="/" className="button button-primary">Back to home</a></main>
  if (!username) return (
    <main className="route-error">
      <h1>Join the conversation</h1>
      <p>Enter your name to join room <strong>{roomId}</strong>.</p>
      <form className="room-form" onSubmit={event => {
        event.preventDefault()
        if (name.trim()) router.replace('/room/' + roomId + '?username=' + encodeURIComponent(name.trim()))
      }}>
        <div className="field"><label htmlFor="guest-name">Your name</label><input id="guest-name" autoComplete="name" maxLength={60} value={name} required onChange={event => setName(event.target.value)} /></div>
        <button className="button button-primary" type="submit">Join room</button>
        <a href="/" className="button">Back to home</a>
      </form>
    </main>
  )
  return <InterviewRoom key={roomId + username} roomId={roomId} username={username} />
}

function InterviewRoom({ roomId, username }: { roomId: string; username: string }) {
  const router = useRouter()
  const room = useRoom(roomId, username)
  const [activeView, setActiveView] = useState<'code' | 'whiteboard' | 'screen'>('code')
  const [sideView, setSideView] = useState<'chat' | 'feedback'>('chat')
  const [showCollaboration, setShowCollaboration] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [minutes, setMinutes] = useState('45')
  const [stdin, setStdin] = useState('')
  const [outputOpen, setOutputOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const selectedLanguage = LANGUAGES.find(item => item.value === room.language)
  const filename = 'solution.' + (selectedLanguage?.extension || 'txt')
  const sharedScreen = room.media.screen || room.media.remoteScreen
  const seconds = room.timerSeconds
  const timer = Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0')

  useEffect(() => {
    const list = chatRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [room.chatMessages, sideView, showCollaboration])

  async function copy(value: string, message: string) {
    try { await navigator.clipboard.writeText(value); room.setNotice(message) }
    catch { room.setNotice('Copy failed. You can select the room code or use the editor to copy manually.') }
  }

  function downloadCode() {
    const url = URL.createObjectURL(new Blob([room.code], { type: 'text/plain' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function runCode() {
    if (running) return
    setRunning(true)
    setOutputOpen(true)
    setResult(null)
    try {
      const data = await roomRequest<RunResult>('execute', { code: room.code, language: room.language, stdin })
      if (typeof data.status !== 'string') throw new Error('The execution service returned an unexpected response.')
      setResult(data)
    } catch (cause) {
      setResult({
        stdout: '', stderr: '', compile_output: '', status: 'Error', time: null, memory: null,
        error: cause instanceof Error ? cause.message : 'Code execution failed. Please try again.',
      })
    } finally { setRunning(false) }
  }

  async function reviewCode() {
    if (reviewing) return
    setReviewing(true)
    setFeedbackError('')
    try {
      const data = await roomRequest<{ feedback: string }>('ai-feedback', { code: room.code, language: room.language })
      if (typeof data.feedback !== 'string' || !data.feedback.trim()) throw new Error('No feedback was returned. Please try again.')
      setFeedback(data.feedback)
    } catch (cause) {
      setFeedbackError(cause instanceof Error ? cause.message : 'Could not load feedback. Please try again.')
    } finally { setReviewing(false) }
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (room.sendMessage(chatInput)) setChatInput('')
  }

  const tools: { view: 'code' | 'whiteboard' | 'screen'; icon: IconName; label: string }[] = [
    { view: 'code', icon: 'code', label: 'Code' },
    { view: 'whiteboard', icon: 'pen', label: 'Whiteboard' },
    ...(sharedScreen ? [{ view: 'screen' as const, icon: 'screen' as const, label: 'Screen' }] : []),
  ]
  const visibleView = activeView === 'screen' && !sharedScreen ? 'code' : activeView

  return (
    <div className="room-shell">
      <a className="skip-link" href="#interview-workspace">Skip to workspace</a>
      <header className="room-header">
        <div className="room-identity">
          <a href="/" className="brand" onClick={event => { event.preventDefault(); dialogRef.current?.showModal() }}>
            <span className="brand-mark"><Icon name="code" /></span>Live Interview
          </a>
          <div className="room-code"><span>Room</span><strong>{roomId}</strong></div>
        </div>
        <div className="room-header-actions">
          <span className={'connection ' + (room.connected ? 'is-connected' : '')} role="status">{room.connected ? 'Connected' : 'Not connected'}</span>
          <button className="button" onClick={() => copy(roomId, 'Room code copied. Share it with your partner.')}><Icon name="copy" />Copy code</button>
          <button className="button mobile-panel-button" aria-expanded={showCollaboration} aria-controls="collaboration-sidebar" onClick={() => setShowCollaboration(!showCollaboration)}>
            <Icon name={showCollaboration ? 'code' : 'users'} />{showCollaboration ? 'Workspace' : 'People & chat'}
          </button>
        </div>
      </header>

      {room.roomError && <div className="alert alert-error room-notice" role="alert"><Icon name="alert" /><span>{room.roomError}</span><a href="/" onClick={() => room.leave()}>Return home</a></div>}
      {room.notice && <div className="alert alert-info room-notice" role="status"><Icon name="chat" /><span>{room.notice}</span><button aria-label="Dismiss notification" onClick={() => room.setNotice('')}><Icon name="close" /></button></div>}

      <main className={'room-body ' + (showCollaboration ? 'show-collaboration' : '')}>
        <section id="interview-workspace" className="workspace" aria-label="Interview workspace">
          <div className="workspace-toolbar">
            <div className="view-switch" aria-label="Workspace views">
              {tools.map(tool => <button key={tool.view} aria-pressed={visibleView === tool.view} onClick={() => setActiveView(tool.view)}><Icon name={tool.icon} />{tool.label}</button>)}
            </div>
            {visibleView === 'code' && <button className="button button-primary" disabled={running || !room.connected || !room.code.trim()} onClick={runCode}><Icon name={running ? 'loader' : 'play'} className={running ? 'spin' : ''} />{running ? 'Running…' : 'Run code'}</button>}
          </div>

          <div className="workspace-view" hidden={visibleView !== 'code'}>
            <div className="editor-panel">
              <div className="editor-toolbar">
                <span className="editor-file">{filename}</span>
                <div className="editor-actions">
                  <label className="sr-only" htmlFor="language">Programming language</label>
                  <select id="language" value={room.language} onChange={event => room.changeLanguage(event.target.value)} disabled={!room.connected}>
                    {LANGUAGES.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
                  </select>
                  <button className="button icon-button" aria-label="Copy source code" title="Copy source code" onClick={() => copy(room.code, 'Source code copied.')}><Icon name="copy" /></button>
                  <button className="button icon-button" aria-label="Download source code" title="Download source code" onClick={downloadCode}><Icon name="download" /></button>
                </div>
              </div>
              <div className="editor-container">
                <MonacoEditor height="100%" language={room.language} value={room.code} onChange={room.changeCode} theme="vs-dark"
                  loading={<div className="editor-loading"><Icon name="loader" className="spin" />Loading editor…</div>}
                  options={{
                    fontSize: 15, minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false,
                    automaticLayout: true, padding: { top: 18, bottom: 16 }, readOnly: !room.connected,
                    ariaLabel: 'Shared code editor', tabSize: 2, lineNumbersMinChars: 3,
                  }} />
              </div>
              <details className="console" open={outputOpen} onToggle={event => setOutputOpen(event.currentTarget.open)}>
                <summary>Console & input{running ? ' · Running…' : result ? ' · ' + result.status : ''}</summary>
                <div className="console-content">
                  <div className="field"><label htmlFor="stdin">Standard input</label><textarea id="stdin" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="Input for your program" spellCheck={false} /><p className="field-hint">Included on the next run.</p></div>
                  <div aria-live="polite" aria-busy={running}>
                    {running ? <p>Running your code…</p> : result ? <>
                      <p className="output-status">{result.status}{result.time != null ? ' · ' + result.time + 's' : ''}{result.memory != null ? ' · ' + result.memory + ' KB' : ''}</p>
                      {result.stdout && <pre>{result.stdout}</pre>}
                      {result.compile_output && <pre className="output-error">{result.compile_output}</pre>}
                      {result.stderr && <pre className="output-error">{result.stderr}</pre>}
                      {result.error && <pre className="output-error">{result.error}</pre>}
                      {!result.stdout && !result.stderr && !result.compile_output && !result.error && <pre>No output.</pre>}
                    </> : <p>Run your code to see its output here.</p>}
                  </div>
                </div>
              </details>
            </div>
          </div>
          <div className="workspace-view" hidden={visibleView !== 'whiteboard'}><Whiteboard roomId={roomId} connected={room.connected} /></div>
          {sharedScreen && <div className="workspace-view" hidden={visibleView !== 'screen'}><div className="screen-panel"><MediaVideo stream={sharedScreen} muted label={room.media.screen ? 'Your shared screen' : 'Your partner’s shared screen'} /></div></div>}
        </section>

        <aside id="collaboration-sidebar" className="room-sidebar" aria-label="People and collaboration">
          <section className="people-panel" aria-labelledby="people-heading">
            <div className="panel-heading"><h2 id="people-heading">In this room</h2><span>{room.participants} / 2 people</span></div>
            <div className="video-grid">
              <div className="video-tile local">
                <MediaVideo stream={room.media.local} muted label="Your camera" />
                {!room.media.cameraOn && <div className="video-placeholder"><span>{username.slice(0, 2).toUpperCase()}</span><p>Camera off</p></div>}
                <span className="video-label">{username} (you)</span>
              </div>
              <div className="video-tile">
                <MediaVideo stream={room.media.remote} label="Your interview partner" />
                {(!room.media.remote || !room.media.remoteCameraOn) && <div className="video-placeholder"><Icon name="users" /><p>{room.participants < 2 ? 'Waiting to join' : 'Camera off'}</p></div>}
                <span className="video-label">{room.participants < 2 ? 'Invite your partner' : room.partnerName}</span>
              </div>
            </div>
            <p className="participant-hint">{room.participants < 2 ? 'Share the room code to invite one person.' : 'You’re ready to collaborate.'}</p>
          </section>

          <section className="collaboration-panel">
            <div className="view-switch" aria-label="Collaboration views">
              <button aria-pressed={sideView === 'chat'} onClick={() => setSideView('chat')}><Icon name="chat" />Chat</button>
              <button aria-pressed={sideView === 'feedback'} onClick={() => setSideView('feedback')}><Icon name="sparkles" />AI feedback</button>
            </div>
            {sideView === 'chat' ? <div className="chat-panel">
              <div className="chat-list" ref={chatRef} role="log" aria-label="Session messages" aria-live="polite">
                {room.chatMessages.length === 0 ? <div className="empty-state"><Icon name="chat" /><h3>Keep the conversation going</h3><p>Share a question, a link, or a thought with your partner.</p></div> : room.chatMessages.map((message, index) => (
                  <div className={'chat-message ' + (message.self ? 'self' : '')} key={index}>
                    <div className="chat-meta"><span>{message.self ? 'You' : message.sender}</span><time>{message.time}</time></div><p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={sendChat}>
                <label className="sr-only" htmlFor="chat-message">Message your partner</label>
                <input id="chat-message" placeholder="Message your partner…" value={chatInput} maxLength={4000} onChange={event => setChatInput(event.target.value)} disabled={!room.connected} />
                <button type="submit" className="button button-primary icon-button" aria-label="Send message" disabled={!room.connected || !chatInput.trim()}><Icon name="arrow" /></button>
              </form>
            </div> : <div className="feedback-panel">
              {!feedback && <div className="empty-state"><Icon name="sparkles" /><h3>A second look at your code</h3><p>Request feedback on correctness, complexity, and edge cases.</p></div>}
              <button className="button button-primary button-wide" onClick={reviewCode} disabled={reviewing || !room.connected || !room.code.trim()}><Icon name={reviewing ? 'loader' : 'sparkles'} className={reviewing ? 'spin' : ''} />{reviewing ? 'Reviewing code…' : feedback ? 'Review current code' : 'Get code feedback'}</button>
              {feedbackError && <p className="alert alert-error" role="alert">{feedbackError}</p>}
              {feedback && <div className="feedback-text" aria-live="polite">{feedback.split(/(\*\*.*?\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</div>}
              <p className="feedback-note">Reviews the code when you request it. Check suggestions before applying them.</p>
            </div>}
          </section>
        </aside>
      </main>

      <footer className="room-footer">
        <div className="media-controls" aria-label="Media controls">
          <button className={'button ' + (room.media.microphoneOn ? 'button-active' : '')} disabled={!room.connected || room.media.busy} aria-pressed={room.media.microphoneOn} aria-label={room.media.microphoneOn ? 'Mute microphone' : 'Turn on microphone'} title={room.media.microphoneOn ? 'Mute microphone' : 'Turn on microphone'} onClick={() => room.mediaRef.current?.toggle('audio')}>
            <Icon name={room.media.microphoneOn ? 'mic' : 'micOff'} /><span>{room.media.microphoneOn ? 'Mic on' : 'Mic off'}</span>
          </button>
          <button className={'button ' + (room.media.cameraOn ? 'button-active' : '')} disabled={!room.connected || room.media.busy} aria-pressed={room.media.cameraOn} aria-label={room.media.cameraOn ? 'Turn off camera' : 'Turn on camera'} title={room.media.cameraOn ? 'Turn off camera' : 'Turn on camera'} onClick={() => room.mediaRef.current?.toggle('video')}>
            <Icon name={room.media.cameraOn ? 'video' : 'videoOff'} /><span>{room.media.cameraOn ? 'Camera on' : 'Camera off'}</span>
          </button>
          <button className={'button ' + (room.media.screen ? 'button-active' : '')} disabled={!room.connected || room.media.busy || !!room.media.remoteScreen || room.participants < 2} aria-pressed={!!room.media.screen} aria-label={room.media.screen ? 'Stop screen sharing' : 'Share screen'} title={room.participants < 2 ? 'Screen sharing is available when your partner joins' : 'Share screen'} onClick={async () => {
            if (room.media.screen) room.mediaRef.current?.stopScreen()
            else { await room.mediaRef.current?.startScreen(); setActiveView('screen') }
          }}><Icon name="screen" /><span>{room.media.screen ? 'Stop sharing' : 'Share screen'}</span></button>
        </div>
        <div className="timer-controls" aria-label="Shared interview timer">
          <Icon name="clock" /><output aria-label="Time remaining">{timer}</output>
          {!room.timerRunning && !room.timerSeconds && <><label className="sr-only" htmlFor="timer-minutes">Timer duration in minutes</label><input id="timer-minutes" type="number" min={1} max={180} value={minutes} onChange={event => setMinutes(event.target.value)} /><span>min</span></>}
          <button className="button icon-button" aria-label={room.timerRunning ? 'Pause timer' : 'Start timer'} title={room.timerRunning ? 'Pause timer' : 'Start timer'} disabled={!room.connected || (!room.timerSeconds && (Number(minutes) < 1 || Number(minutes) > 180))} onClick={() => room.toggleTimer(Number(minutes))}><Icon name={room.timerRunning ? 'pause' : 'play'} /></button>
          <button className="button icon-button" aria-label="Reset timer" title="Reset timer" disabled={!room.connected || !room.timerSeconds} onClick={room.clearTimer}><Icon name="reset" /></button>
        </div>
        <button className="button button-danger" onClick={() => dialogRef.current?.showModal()}><Icon name="leave" />Leave<span className="desktop-label"> room</span></button>
      </footer>

      <dialog className="leave-dialog" ref={dialogRef} aria-labelledby="leave-title" aria-describedby="leave-description">
        <h2 id="leave-title">Leave this interview?</h2>
        <p id="leave-description">Your camera and microphone will turn off. Download your code first if you want to keep a copy.</p>
        <div className="dialog-actions"><button className="button" autoFocus onClick={() => dialogRef.current?.close()}>Stay in room</button><button className="button button-danger" onClick={() => { room.leave(); router.push('/') }}>Leave room</button></div>
      </dialog>
    </div>
  )
}
