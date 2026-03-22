'use client'
import SimplePeer from 'simple-peer'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSocket, disconnectSocket } from '@/lib/socket'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface ChatMessage {
  sender: string
  text: string
  time: string
  self: boolean
}

// Map language → file extension
const EXTENSIONS: Record<string, string> = {
  javascript:  'js',
  typescript:  'ts',
  python:      'py',
  java:        'java',
  cpp:         'cpp',
  go:          'go',
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.roomId as string
  const username = searchParams.get('username') || 'Anonymous'

  const [code, setCode] = useState('// Start coding here\n')
  const [language, setLanguage] = useState('javascript')
  const [activeTab, setActiveTab] = useState<'code' | 'whiteboard'>('code')
  const [participants, setParticipants] = useState(1)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [videoActive, setVideoActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(3)
  const [feedback, setFeedback] = useState('')
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Timer state ───────────────────────────────────────────
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerInput, setTimerInput] = useState('45')
  const [showTimerInput, setShowTimerInput] = useState(false)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecondsRef = useRef(0)

  const isRemoteChange = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localOverlayRef = useRef<HTMLDivElement>(null)
  const remoteOverlayRef = useRef<HTMLDivElement>(null)
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Download code ─────────────────────────────────────────
  const downloadCode = () => {
    const ext = EXTENSIONS[language] || 'txt'
    const filename = `solution.${ext}`
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Timer ─────────────────────────────────────────────────
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startTimerAt = useCallback((seconds: number) => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    timerSecondsRef.current = seconds
    setTimerSeconds(seconds)
    setTimerRunning(true)
    timerIntervalRef.current = setInterval(() => {
      timerSecondsRef.current -= 1
      setTimerSeconds(timerSecondsRef.current)
      if (timerSecondsRef.current <= 0) {
        clearInterval(timerIntervalRef.current!)
        timerIntervalRef.current = null
        setTimerRunning(false)
        timerSecondsRef.current = 0
        setTimerSeconds(0)
      }
    }, 1000)
  }, [])

  const pauseTimer = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    setTimerRunning(false)
  }, [])

  const resetTimerFn = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    timerSecondsRef.current = 0
    setTimerSeconds(0)
    setTimerRunning(false)
  }, [])

  useEffect(() => { return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) } }, [])

  const handleStartTimer = () => {
    const mins = parseInt(timerInput)
    if (isNaN(mins) || mins <= 0) return
    const secs = mins * 60
    startTimerAt(secs)
    setShowTimerInput(false)
    getSocket().emit('timer_start', { room_id: roomId, seconds: secs })
  }
  const handleResumeTimer = () => {
    const secs = timerSecondsRef.current
    startTimerAt(secs)
    getSocket().emit('timer_resume', { room_id: roomId, seconds: secs })
  }
  const handlePauseTimer = () => { pauseTimer(); getSocket().emit('timer_stop', { room_id: roomId }) }
  const handleResetTimer = () => { resetTimerFn(); getSocket().emit('timer_reset', { room_id: roomId }) }

  const timerColor = timerSeconds <= 60 && timerSeconds > 0 ? 'text-red-400'
    : timerSeconds <= 300 && timerSeconds > 0 ? 'text-yellow-400' : 'text-green-400'

  // ── Overlay helpers ───────────────────────────────────────
  const showLocalOverlay  = () => { if (localOverlayRef.current)  localOverlayRef.current.style.opacity  = '1' }
  const hideLocalOverlay  = () => { if (localOverlayRef.current)  localOverlayRef.current.style.opacity  = '0' }
  const showRemoteOverlay = () => { if (remoteOverlayRef.current) remoteOverlayRef.current.style.opacity = '1' }
  const hideRemoteOverlay = () => { if (remoteOverlayRef.current) remoteOverlayRef.current.style.opacity = '0' }

  // ── Video helpers ─────────────────────────────────────────
  const resetVideo = (ref: React.RefObject<HTMLVideoElement | null>) => {
    if (!ref.current) return
    ref.current.pause(); ref.current.srcObject = null
    ref.current.removeAttribute('src'); ref.current.load()
  }
  const attachStream = (ref: React.RefObject<HTMLVideoElement | null>, stream: MediaStream, muted = false) => {
    if (!ref.current) return
    ref.current.srcObject = stream; ref.current.muted = muted
    ref.current.play().catch(err => console.warn('Autoplay blocked:', err))
  }
  const destroyPeer = () => {
    if (peerRef.current) { peerRef.current.removeAllListeners(); peerRef.current.destroy(); peerRef.current = null }
  }
  const clearRemoteVideo = () => { resetVideo(remoteVideoRef); showRemoteOverlay() }

  // ── Create WebRTC peer ────────────────────────────────────
  const createPeer = (initiator: boolean, stream: MediaStream | null, socket: any) => {
    destroyPeer()
    const peerOptions: any = { initiator, trickle: false }
    if (stream) peerOptions.stream = stream
    const peer = new SimplePeer(peerOptions)
    peer.on('signal', (data) => {
      if (data.type === 'offer') socket.emit('webrtc_offer', { sdp: data, room_id: roomId })
      else if (data.type === 'answer') socket.emit('webrtc_answer', { sdp: data, room_id: roomId })
    })
    peer.on('stream', (remoteStream) => {
      setTimeout(() => { attachStream(remoteVideoRef, remoteStream, false); hideRemoteOverlay() }, 200)
    })
    peer.on('close', () => { clearRemoteVideo(); peerRef.current = null })
    peer.on('error', (err) => { console.error('Peer error:', err); clearRemoteVideo(); peerRef.current = null })
    peer.on('connect', () => console.log('✅ Peer connected!'))
    peerRef.current = peer
  }

  // ── Socket.IO ─────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    socket.on('connect', () => { setConnected(true); socket.emit('join_room', { room_id: roomId, username }) })
    socket.on('disconnect', () => setConnected(false))
    socket.on('room_full', (data: any) => { alert(data.message); router.push('/') })
    socket.on('room_joined', (data: any) => {
      isRemoteChange.current = true
      setCode(data.code); setLanguage(data.language); setParticipants(data.participants)
      isRemoteChange.current = false
    })
    socket.on('user_joined', (data: any) => {
      setParticipants(data.participants)
      setMessages(prev => [...prev, `✅ ${data.username} joined`])
    })
    socket.on('user_left', () => {
      setParticipants(prev => Math.max(1, prev - 1))
      setMessages(prev => [...prev, `❌ A user left`])
      clearRemoteVideo(); destroyPeer()
    })
    socket.on('code_updated', (data: any) => {
      isRemoteChange.current = true; setCode(data.code); isRemoteChange.current = false
    })
    socket.on('language_updated', (data: any) => setLanguage(data.language))
    socket.on('webrtc_offer',  (data: any) => { if (peerRef.current) peerRef.current.signal(data.sdp) })
    socket.on('webrtc_answer', (data: any) => { if (peerRef.current) peerRef.current.signal(data.sdp) })
    socket.on('peer_ready', () => { createPeer(false, localStreamRef.current, socket) })
    socket.on('remote_video_stopped', () => clearRemoteVideo())
    socket.on('chat_message', (data: any) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setChatMessages(prev => [...prev, { sender: data.sender, text: data.text, time, self: false }])
    })
    socket.on('timer_start',  (data: any) => startTimerAt(data.seconds))
    socket.on('timer_resume', (data: any) => startTimerAt(data.seconds))
    socket.on('timer_stop',   ()           => pauseTimer())
    socket.on('timer_reset',  ()           => resetTimerFn())
    socket.on('whiteboard_updated', (data: any) => {
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d'); if (!ctx) return
      ctx.beginPath(); ctx.moveTo(data.x1, data.y1); ctx.lineTo(data.x2, data.y2)
      ctx.strokeStyle = data.color; ctx.lineWidth = data.size; ctx.lineCap = 'round'; ctx.stroke()
    })
    return () => { disconnectSocket() }
  }, [roomId, username, startTimerAt, pauseTimer, resetTimerFn])

  // ── Whiteboard ────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'whiteboard') return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight
    ctx.putImageData(imageData, 0, 0)
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (e instanceof MouseEvent) return { x: e.clientX - rect.left, y: e.clientY - rect.top }
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    const startDraw = (e: MouseEvent | TouchEvent) => { isDrawing.current = true; lastPos.current = getPos(e) }
    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current || !lastPos.current) return
      const pos = getPos(e)
      ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = brushColor
      ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.stroke()
      getSocket().emit('whiteboard_draw', { room_id: roomId, x1: lastPos.current.x, y1: lastPos.current.y, x2: pos.x, y2: pos.y, color: brushColor, size: brushSize })
      lastPos.current = pos
    }
    const stopDraw = () => { isDrawing.current = false; lastPos.current = null }
    canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw); canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw); canvas.addEventListener('touchmove', draw)
    canvas.addEventListener('touchend', stopDraw)
    return () => {
      canvas.removeEventListener('mousedown', startDraw); canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDraw); canvas.removeEventListener('mouseleave', stopDraw)
      canvas.removeEventListener('touchstart', startDraw); canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDraw)
    }
  }, [activeTab, brushColor, brushSize, roomId])

  // ── Misc handlers ─────────────────────────────────────────
  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || ''; setCode(newCode)
    if (!isRemoteChange.current) getSocket().emit('code_change', { room_id: roomId, code: newCode })
  }
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang); getSocket().emit('language_change', { room_id: roomId, language: newLang })
  }
  const copyRoomId = () => {
    try { navigator.clipboard.writeText(roomId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
    catch {
      const el = document.createElement('textarea'); el.value = roomId
      el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.focus(); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream; setVideoActive(true)
      attachStream(localVideoRef, stream, true); hideLocalOverlay()
      const socket = getSocket(); createPeer(true, stream, socket)
      socket.emit('video_ready', { room_id: roomId })
    } catch { alert('Could not access camera/microphone. Please allow permissions!') }
  }
  const stopVideo = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    resetVideo(localVideoRef); showLocalOverlay()
    localStreamRef.current = null; setVideoActive(false)
    getSocket().emit('video_stopped', { room_id: roomId })
  }
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setMuted(prev => !prev)
    }
  }
  const clearCanvas = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  const sendMessage = () => {
    const text = chatInput.trim(); if (!text) return
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    getSocket().emit('chat_message', { room_id: roomId, sender: username, text })
    setChatMessages(prev => [...prev, { sender: username, text, time, self: true }])
    setChatInput('')
  }
  const getAIFeedback = async () => {
    setFeedback(''); setLoadingFeedback(true)
    try {
      const res = await fetch('http://localhost:8000/rooms/ai-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      })
      const data = await res.json(); setFeedback(data.feedback)
    } catch { setFeedback('❌ Error getting feedback. Is the backend running?') }
    finally { setLoadingFeedback(false) }
  }
  const renderFeedback = (text: string) => text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />
    const parts = line.split(/\*\*(.*?)\*\*/g)
    return (
      <p key={i} className={line.startsWith('**') ? 'mt-3 mb-1' : 'mb-1 text-gray-400'}>
        {parts.map((part, j) => j % 2 === 1
          ? <span key={j} className="font-bold text-white">{part}</span>
          : <span key={j}>{part}</span>
        )}
      </p>
    )
  })

  const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'go']

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-blue-400 font-bold">💻 Interview Platform</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 text-sm">Room: <span className="text-white font-mono">{roomId}</span></span>
          <button onClick={copyRoomId} className={`text-xs px-2 py-1 rounded transition ${copied ? 'bg-green-700 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}>
            {copied ? '✅ Copied!' : 'Copy ID'}
          </button>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2">
          {timerSeconds > 0 || timerRunning ? (
            <>
              <span className={`font-mono text-lg font-bold tabular-nums ${timerColor} ${timerSeconds <= 60 && timerRunning ? 'animate-pulse' : ''}`}>
                ⏱ {formatTime(timerSeconds)}
              </span>
              {timerRunning
                ? <button onClick={handlePauseTimer}  className="text-xs px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded transition">Pause</button>
                : <button onClick={handleResumeTimer} className="text-xs px-2 py-1 bg-green-700  hover:bg-green-600  rounded transition">Resume</button>
              }
              <button onClick={handleResetTimer} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition">Reset</button>
            </>
          ) : showTimerInput ? (
            <div className="flex items-center gap-2">
              <input type="number" value={timerInput} onChange={e => setTimerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStartTimer()}
                className="w-16 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-blue-500 text-center"
                placeholder="min" min="1" max="180" />
              <span className="text-gray-400 text-xs">min</span>
              <button onClick={handleStartTimer}          className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 rounded transition">▶ Start</button>
              <button onClick={() => setShowTimerInput(false)} className="text-xs px-2 py-1 bg-gray-700  hover:bg-gray-600  rounded transition">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowTimerInput(true)} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition">
              ⏱ Set Timer
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {messages.length > 0 && <span className="text-xs text-gray-400">{messages[messages.length - 1]}</span>}
          <span className="text-gray-400 text-sm">👤 {username}</span>
          <span className="text-gray-400 text-sm">🟢 {participants} online</span>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Video + Chat ── */}
        <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="p-3 flex flex-col gap-3">
            <div className="rounded-lg aspect-video overflow-hidden relative" style={{ background: '#1f2937' }}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div ref={localOverlayRef} className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm"
                style={{ opacity: 1, background: '#1f2937', zIndex: 10, transition: 'opacity 0.2s' }}>🎥 Your Video</div>
            </div>
            <div className="rounded-lg aspect-video overflow-hidden relative" style={{ background: '#1f2937' }}>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div ref={remoteOverlayRef} className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm"
                style={{ opacity: 1, background: '#1f2937', zIndex: 10, transition: 'opacity 0.2s' }}>👤 Participant</div>
            </div>
            <div className="flex gap-2">
              {!videoActive
                ? <button onClick={startVideoCall} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition">🎥 Start Video</button>
                : <button onClick={stopVideo}      className="flex-1 py-2 bg-red-600  hover:bg-red-700  rounded-lg text-xs font-medium transition">⏹ Stop Video</button>
              }
              <button onClick={toggleMute} className={`flex-1 py-2 rounded-lg text-xs transition ${muted ? 'bg-red-800 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-700'}`}>
                {muted ? '🔇 Unmute' : '🎤 Mute'}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-800 mx-3" />

          <div className="flex flex-col flex-1 overflow-hidden p-3 gap-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">💬 Chat</div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
              {chatMessages.length === 0 && <div className="text-center text-gray-600 text-xs mt-4">No messages yet. Say hi! 👋</div>}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-0.5 ${msg.self ? 'items-end' : 'items-start'}`}>
                  <span className="text-xs text-gray-500 px-1">{msg.self ? 'You' : msg.sender}</span>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${msg.self ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-100 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                  <span className="text-xs text-gray-600 px-1">{msg.time}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 items-center">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message..."
                className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-xl border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-500" />
              <button onClick={sendMessage} disabled={!chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-sm transition">➤</button>
            </div>
          </div>
        </div>

        {/* ── Center ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Editor toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
            <button onClick={() => setActiveTab('code')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'code' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              💻 Code Editor
            </button>
            <button onClick={() => setActiveTab('whiteboard')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'whiteboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              🎨 Whiteboard
            </button>

            {activeTab === 'code' && (
              <div className="ml-auto flex items-center gap-2">
                {/* Language selector */}
                <select value={language} onChange={e => handleLanguageChange(e.target.value)}
                  className="bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500">
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                {/* Download button */}
                <button
                  onClick={downloadCode}
                  title={`Download as solution.${EXTENSIONS[language] || 'txt'}`}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-green-700 border border-gray-700 hover:border-green-600 text-gray-300 hover:text-white rounded-lg transition"
                >
                  ⬇ solution.{EXTENSIONS[language] || 'txt'}
                </button>
              </div>
            )}
          </div>

          {activeTab === 'code' && (
            <div className="flex-1">
              <MonacoEditor height="100%" language={language} value={code} onChange={handleCodeChange} theme="vs-dark"
                options={{ fontSize: 14, minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false }} />
            </div>
          )}

          {activeTab === 'whiteboard' && (
            <div className="flex-1 bg-white relative">
              <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none', cursor: 'crosshair' }} />
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white rounded-lg shadow-md p-2 border border-gray-200">
                {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#ffffff'].map(color => (
                  <button key={color} onClick={() => setBrushColor(color)} className="w-7 h-7 rounded-full border-2 shadow transition"
                    style={{ backgroundColor: color, borderColor: brushColor === color ? '#6366f1' : '#e5e7eb', transform: brushColor === color ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
                <div className="w-px h-6 bg-gray-200 mx-1" />
                {[2, 5, 10].map(size => (
                  <button key={size} onClick={() => setBrushSize(size)} className={`rounded-full bg-gray-800 transition ${brushSize === size ? 'ring-2 ring-blue-500' : ''}`}
                    style={{ width: size * 2 + 8, height: size * 2 + 8 }} />
                ))}
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button onClick={clearCanvas} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">Clear</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: AI Feedback ── */}
        <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="p-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300">🤖 AI Feedback</h3>
            <p className="text-xs text-gray-500 mt-0.5">Powered by Llama 3.3 via Groq</p>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            {loadingFeedback
              ? <div className="text-gray-400 text-sm text-center mt-8 animate-pulse">⏳ Analyzing your code...</div>
              : feedback
                ? <div className="text-sm leading-relaxed">{renderFeedback(feedback)}</div>
                : <div className="text-gray-500 text-sm text-center mt-8">Write some code and click "Get Feedback" to receive AI analysis</div>
            }
          </div>
          <div className="p-3 border-t border-gray-800">
            <button onClick={getAIFeedback} disabled={loadingFeedback}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition">
              {loadingFeedback ? '⏳ Analyzing...' : '✨ Get AI Feedback'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}