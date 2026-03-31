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

interface RunResult {
  stdout: string
  stderr: string
  compile_output: string
  status: string
  time: string | null
  memory: number | null
  error: string
}

const EXTENSIONS: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py',
  java: 'java', cpp: 'cpp', go: 'go',
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
  const [micReady, setMicReady] = useState(false)
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(3)
  const [feedback, setFeedback] = useState('')
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const [stdinInput, setStdinInput] = useState('')
  const [showStdin, setShowStdin] = useState(false)

  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerInput, setTimerInput] = useState('45')
  const [showTimerInput, setShowTimerInput] = useState(false)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecondsRef = useRef(0)

  const [screenSharing, setScreenSharing] = useState(false)
  const [remoteScreenActive, setRemoteScreenActive] = useState(false)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const screenOverlayRef = useRef<HTMLDivElement>(null)
  const screenPeerRef = useRef<SimplePeer.Instance | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  const isRemoteChange = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const localOverlayRef = useRef<HTMLDivElement>(null)
  const remoteOverlayRef = useRef<HTMLDivElement>(null)
  const audioPeerRef = useRef<SimplePeer.Instance | null>(null)
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const runCode = async () => {
    setRunning(true)
    setOutputOpen(true)
    setRunResult(null)
    try {
      const res = await fetch('http://192.168.1.35:8000/rooms/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin: stdinInput })
      })
      const data = await res.json()
      setRunResult(data)
    } catch (e) {
      setRunResult({
        stdout: '', stderr: '', compile_output: '',
        status: 'Error', time: null, memory: null,
        error: 'Could not reach backend. Is it running?'
      })
    } finally {
      setRunning(false)
    }
  }

  const downloadCode = () => {
    const ext = EXTENSIONS[language] || 'txt'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `solution.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }
  const startTimerAt = useCallback((seconds: number) => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    timerSecondsRef.current = seconds
    setTimerSeconds(seconds); setTimerRunning(true)
    timerIntervalRef.current = setInterval(() => {
      timerSecondsRef.current -= 1
      setTimerSeconds(timerSecondsRef.current)
      if (timerSecondsRef.current <= 0) {
        clearInterval(timerIntervalRef.current!); timerIntervalRef.current = null
        setTimerRunning(false); timerSecondsRef.current = 0; setTimerSeconds(0)
      }
    }, 1000)
  }, [])
  const pauseTimer = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    setTimerRunning(false)
  }, [])
  const resetTimerFn = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    timerSecondsRef.current = 0; setTimerSeconds(0); setTimerRunning(false)
  }, [])
  useEffect(() => { return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) } }, [])

  const handleStartTimer = () => {
    const mins = parseInt(timerInput); if (isNaN(mins) || mins <= 0) return
    const secs = mins * 60; startTimerAt(secs); setShowTimerInput(false)
    getSocket().emit('timer_start', { room_id: roomId, seconds: secs })
  }
  const handleResumeTimer = () => {
    const secs = timerSecondsRef.current; startTimerAt(secs)
    getSocket().emit('timer_resume', { room_id: roomId, seconds: secs })
  }
  const handlePauseTimer  = () => { pauseTimer();   getSocket().emit('timer_stop',  { room_id: roomId }) }
  const handleResetTimer  = () => { resetTimerFn(); getSocket().emit('timer_reset', { room_id: roomId }) }

  const showLocalOverlay  = () => { if (localOverlayRef.current)  localOverlayRef.current.style.opacity  = '1' }
  const hideLocalOverlay  = () => { if (localOverlayRef.current)  localOverlayRef.current.style.opacity  = '0' }
  const showRemoteOverlay = () => { if (remoteOverlayRef.current) remoteOverlayRef.current.style.opacity = '1' }
  const hideRemoteOverlay = () => { if (remoteOverlayRef.current) remoteOverlayRef.current.style.opacity = '0' }
  const showScreenOverlay = () => { if (screenOverlayRef.current) screenOverlayRef.current.style.opacity = '1' }
  const hideScreenOverlay = () => { if (screenOverlayRef.current) screenOverlayRef.current.style.opacity = '0' }

  const resetVideo = (ref: React.RefObject<HTMLVideoElement | null>) => {
    if (!ref.current) return
    ref.current.pause(); ref.current.srcObject = null
    ref.current.removeAttribute('src'); ref.current.load()
  }
  const attachStream = (ref: React.RefObject<HTMLVideoElement | null>, stream: MediaStream, muted = false) => {
    if (!ref.current) return
    ref.current.srcObject = stream; ref.current.muted = muted
    ref.current.play().catch(e => console.warn('Autoplay blocked:', e))
  }
  const destroyAudioPeer = () => {
    if (audioPeerRef.current) { audioPeerRef.current.removeAllListeners(); audioPeerRef.current.destroy(); audioPeerRef.current = null }
  }
  const destroyPeer = () => {
    if (peerRef.current) { peerRef.current.removeAllListeners(); peerRef.current.destroy(); peerRef.current = null }
  }
  const destroyScreenPeer = () => {
    if (screenPeerRef.current) { screenPeerRef.current.removeAllListeners(); screenPeerRef.current.destroy(); screenPeerRef.current = null }
  }
  const clearRemoteVideo = () => { resetVideo(remoteVideoRef); showRemoteOverlay() }
  const clearScreenSlot  = () => { resetVideo(screenVideoRef); showScreenOverlay(); setRemoteScreenActive(false) }

  const createAudioPeer = (initiator: boolean, socket: any) => {
    destroyAudioPeer()
    const audioStream = audioStreamRef.current; if (!audioStream) return
    const peer = new SimplePeer({ initiator, trickle: false, stream: audioStream })
    peer.on('signal', (data) => {
      if (data.type === 'offer') socket.emit('webrtc_offer', { sdp: data, room_id: roomId, kind: 'audio' })
      else if (data.type === 'answer') socket.emit('webrtc_answer', { sdp: data, room_id: roomId, kind: 'audio' })
    })
    peer.on('stream', (remoteAudioStream) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteAudioStream
        remoteAudioRef.current.play().catch(e => console.warn('Audio autoplay:', e))
      }
    })
    peer.on('close', () => { audioPeerRef.current = null })
    peer.on('error', (e) => { console.error('Audio peer:', e); audioPeerRef.current = null })
    peer.on('connect', () => console.log('✅ Audio peer connected!'))
    audioPeerRef.current = peer
  }

  const createPeer = (initiator: boolean, videoStream: MediaStream | null, socket: any) => {
    destroyPeer(); if (!videoStream) return
    const peer = new SimplePeer({ initiator, trickle: false, stream: videoStream })
    peer.on('signal', (data) => {
      if (data.type === 'offer') socket.emit('webrtc_offer', { sdp: data, room_id: roomId, kind: 'video' })
      else if (data.type === 'answer') socket.emit('webrtc_answer', { sdp: data, room_id: roomId, kind: 'video' })
    })
    peer.on('stream', (remoteStream) => {
      setTimeout(() => { attachStream(remoteVideoRef, remoteStream, true); hideRemoteOverlay() }, 200)
    })
    peer.on('close', () => { clearRemoteVideo(); peerRef.current = null })
    peer.on('error', (e) => { console.error('Video peer:', e); clearRemoteVideo(); peerRef.current = null })
    peerRef.current = peer
  }

  const createScreenPeer = (initiator: boolean, stream: MediaStream | null, socket: any) => {
    destroyScreenPeer()
    const opts: any = { initiator, trickle: false }; if (stream) opts.stream = stream
    const peer = new SimplePeer(opts)
    peer.on('signal', (data) => {
      if (data.type === 'offer') socket.emit('screen_offer', { sdp: data, room_id: roomId })
      else if (data.type === 'answer') socket.emit('screen_answer', { sdp: data, room_id: roomId })
    })
    peer.on('stream', (s) => {
      setRemoteScreenActive(true)
      setTimeout(() => { attachStream(screenVideoRef, s, true); hideScreenOverlay() }, 200)
    })
    peer.on('close', () => { clearScreenSlot(); screenPeerRef.current = null })
    peer.on('error', (e) => { console.error('Screen peer:', e); clearScreenSlot(); screenPeerRef.current = null })
    screenPeerRef.current = peer
  }

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        audioStreamRef.current = stream; setMicReady(true)
        const socket = getSocket()
        if (socket.connected) {
          socket.emit('audio_ready', { room_id: roomId })
          createAudioPeer(true, socket)
        }
      })
      .catch(e => console.warn('Mic not available:', e))
    return () => {
      if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null }
      destroyAudioPeer()
    }
  }, [roomId])

  useEffect(() => {
    const socket = getSocket()
    socket.on('connect', () => {
      setConnected(true); socket.emit('join_room', { room_id: roomId, username })
      if (audioStreamRef.current) {
        setTimeout(() => { socket.emit('audio_ready', { room_id: roomId }); createAudioPeer(true, socket) }, 500)
      }
    })
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
      if (audioStreamRef.current) {
        setTimeout(() => { socket.emit('audio_ready', { room_id: roomId }); createAudioPeer(true, socket) }, 500)
      }
    })
    socket.on('user_left', () => {
      setParticipants(prev => Math.max(1, prev - 1))
      setMessages(prev => [...prev, `❌ A user left`])
      clearRemoteVideo(); destroyPeer(); clearScreenSlot(); destroyScreenPeer(); destroyAudioPeer()
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    })
    socket.on('code_updated', (data: any) => {
      isRemoteChange.current = true; setCode(data.code); isRemoteChange.current = false
    })
    socket.on('language_updated', (data: any) => setLanguage(data.language))
    socket.on('webrtc_offer', (data: any) => {
      if (data.kind === 'audio' && audioPeerRef.current) audioPeerRef.current.signal(data.sdp)
      else if (data.kind === 'video' && peerRef.current) peerRef.current.signal(data.sdp)
    })
    socket.on('webrtc_answer', (data: any) => {
      if (data.kind === 'audio' && audioPeerRef.current) audioPeerRef.current.signal(data.sdp)
      else if (data.kind === 'video' && peerRef.current) peerRef.current.signal(data.sdp)
    })
    socket.on('audio_peer_ready', () => { createAudioPeer(false, socket) })
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
    socket.on('screen_peer_ready', () => { createScreenPeer(false, null, socket) })
    socket.on('screen_offer',  (data: any) => { if (screenPeerRef.current) screenPeerRef.current.signal(data.sdp) })
    socket.on('screen_answer', (data: any) => { if (screenPeerRef.current) screenPeerRef.current.signal(data.sdp) })
    socket.on('screen_stopped', () => { clearScreenSlot(); destroyScreenPeer() })
    socket.on('whiteboard_updated', (data: any) => {
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d'); if (!ctx) return
      ctx.beginPath(); ctx.moveTo(data.x1, data.y1); ctx.lineTo(data.x2, data.y2)
      ctx.strokeStyle = data.color; ctx.lineWidth = data.size; ctx.lineCap = 'round'; ctx.stroke()
    })
    return () => { disconnectSocket() }
  }, [roomId, username, startTimerAt, pauseTimer, resetTimerFn])

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
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      localStreamRef.current = videoStream; setVideoActive(true)
      attachStream(localVideoRef, videoStream, true); hideLocalOverlay()
      const socket = getSocket(); createPeer(true, videoStream, socket)
      socket.emit('video_ready', { room_id: roomId })
    } catch { alert('Could not access camera. Please allow permissions!') }
  }
  const stopVideo = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    resetVideo(localVideoRef); showLocalOverlay()
    localStreamRef.current = null; setVideoActive(false)
    getSocket().emit('video_stopped', { room_id: roomId })
  }
  const toggleMute = () => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setMuted(prev => !prev)
    }
  }
  const startScreenShare = async () => {
    if (remoteScreenActive) return
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false })
      screenStreamRef.current = stream; setScreenSharing(true)
      stream.getVideoTracks()[0].onended = () => stopScreenShare()
      const socket = getSocket(); createScreenPeer(true, stream, socket)
      socket.emit('screen_ready', { room_id: roomId })
    } catch { console.log('Screen share cancelled') }
  }
  const stopScreenShare = () => {
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null }
    setScreenSharing(false); destroyScreenPeer()
    getSocket().emit('screen_stopped', { room_id: roomId })
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
      const res = await fetch('http://192.168.1.35:8000/rooms/ai-feedback', {
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
      <p key={i} className={line.startsWith('**') ? 'mt-3 mb-1' : ''}>
        {parts.map((part, j) => j % 2 === 1
          ? <span key={j} className="font-bold text-brand-indigo">{part}</span>
          : <span key={j}>{part}</span>
        )}
      </p>
    )
  })

  const getStatusColor = (status: string) => {
    if (status === 'Accepted') return 'text-brand-emerald'
    if (status.includes('Error') || status.includes('Runtime') || status.includes('Compile')) return 'text-red-500'
    if (status === 'Time Limit Exceeded') return 'text-yellow-500'
    return 'text-gray-600'
  }
  const outputText = runResult
    ? (runResult.error || runResult.compile_output || runResult.stderr || runResult.stdout || '(no output)')
    : ''

  const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'go']
  const shareButtonLocked = remoteScreenActive && !screenSharing

  return (
    <div className="h-screen bg-background text-on-surface flex flex-col overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      <style>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .editorial-shadow {
          box-shadow: 0 32px 64px -12px rgba(42, 52, 57, 0.06);
        }
      `}</style>

      {/* ═══ TOP APP BAR ═══ */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-10 h-16 bg-white/80 backdrop-blur-xl shadow-sm border-b border-outline-variant/10">
        <div className="flex items-center gap-6">
          <span className="text-xl font-black tracking-tighter text-on-primary font-headline">Interview Elite</span>
          <div className="h-4 w-px bg-outline-variant/30"></div>
          <div className="flex items-center gap-4">
            <span className="font-headline font-bold text-sm tracking-tight text-brand-indigo">{formatTime(timerSeconds)}</span>
            <span className="font-headline font-medium text-sm tracking-tight text-on-surface">Room ID: {roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors active:scale-95 text-on-surface-variant">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors active:scale-95 text-on-surface-variant">
            <span className="material-symbols-outlined">help</span>
          </button>
          <div className="ml-4 flex items-center gap-2 bg-brand-emerald/10 text-brand-emerald px-4 py-1.5 rounded-full border border-brand-emerald/20">
            <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
            <span className="text-xs font-bold font-headline uppercase tracking-wider">Interview Live</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <main className="ml-20 mt-16 grid grid-cols-12 h-[calc(100vh-128px)] overflow-hidden">
        
        {/* ═══ LEFT SIDEBAR (TOOLS) ═══ */}
        <aside className="fixed left-0 top-16 h-[calc(100vh-128px)] w-20 flex flex-col items-center py-8 space-y-8 bg-surface-container-low border-r border-outline-variant/10 z-40">
          <div className="flex flex-col items-center space-y-1 mb-4">
            <span className="font-headline font-semibold text-[10px] uppercase tracking-[0.1em] text-brand-indigo">Tools</span>
          </div>
          <nav className="flex flex-col items-center space-y-6 w-full">
            <button onClick={() => setActiveTab('code')} className={`w-full flex flex-col items-center gap-1 py-3 transition-all duration-300 ${activeTab === 'code' ? 'text-brand-indigo border-r-4 border-brand-indigo' : 'text-on-surface-variant hover:text-brand-indigo'}`}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'code' ? 1 : 0}` }}>code</span>
              <span className="font-headline font-semibold text-[10px] uppercase tracking-[0.1em]">Editor</span>
            </button>
            <button onClick={() => setActiveTab('whiteboard')} className={`w-full flex flex-col items-center gap-1 py-3 transition-all duration-300 ${activeTab === 'whiteboard' ? 'text-brand-indigo border-r-4 border-brand-indigo' : 'text-on-surface-variant hover:text-brand-indigo'}`}>
              <span className="material-symbols-outlined">draw</span>
              <span className="font-headline font-semibold text-[10px] uppercase tracking-[0.1em]">Board</span>
            </button>
            <button className="w-full flex flex-col items-center gap-1 py-3 text-on-surface-variant hover:text-brand-indigo transition-all duration-300">
              <span className="material-symbols-outlined">terminal</span>
              <span className="font-headline font-semibold text-[10px] uppercase tracking-[0.1em]">Terminal</span>
            </button>
            <button className="w-full flex flex-col items-center gap-1 py-3 text-on-surface-variant hover:text-brand-indigo transition-all duration-300">
              <span className="material-symbols-outlined">forum</span>
              <span className="font-headline font-semibold text-[10px] uppercase tracking-[0.1em]">Chat</span>
            </button>
          </nav>
        </aside>

        {/* ═══ CENTER: EDITOR ═══ */}
        <section className="col-span-8 p-6 bg-surface-container-low overflow-hidden flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex justify-between items-center px-4 py-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-outline-variant/10">
              <span className="text-xs font-bold font-headline text-brand-indigo">
                {activeTab === 'code' ? `${language}.` : 'whiteboard.'}
              </span>
              <span className="material-symbols-outlined text-sm text-outline cursor-pointer" style={{ fontSize: '18px' }}>close</span>
            </div>
            <div className="flex items-center gap-3">
              {activeTab === 'code' && (
                <>
                  <select value={language} onChange={e => handleLanguageChange(e.target.value)}
                    className="bg-white border border-outline-variant/20 text-on-surface text-xs px-3 py-1.5 rounded-lg font-headline font-medium">
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button onClick={() => setShowStdin(p => !p)} className={`text-[10px] px-3 py-1.5 rounded-lg font-headline font-bold uppercase tracking-widest transition ${showStdin ? 'bg-brand-indigo/20 text-brand-indigo border border-brand-indigo/20' : 'bg-white border border-outline-variant/10 text-on-surface-variant hover:text-on-surface'}`}>
                    stdin
                  </button>
                  <button onClick={runCode} disabled={running} className="bg-brand-emerald text-white px-6 py-2 rounded-lg font-headline font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all editorial-shadow disabled:opacity-50">
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    {running ? 'Running...' : 'Run Code'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Code Area */}
          {activeTab === 'code' && (
            <div className="flex-grow bg-white rounded-lg editorial-shadow overflow-hidden flex flex-col">
              {showStdin && (
                <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-high border-b border-outline-variant/10">
                  <span className="text-xs text-on-surface-variant font-headline font-bold">stdin:</span>
                  <input type="text" value={stdinInput} onChange={e => setStdinInput(e.target.value)}
                    placeholder="Enter input for your program (optional)"
                    className="flex-1 bg-white border-b-2 border-primary/30 text-on-surface text-xs px-2 py-1 focus:outline-none focus:border-primary focus:ring-0 font-mono" />
                </div>
              )}
              <div className="flex-grow">
                <MonacoEditor height="100%" language={language} value={code} onChange={handleCodeChange} theme="vs"
                  options={{ fontSize: 14, minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false }} />
              </div>

              {outputOpen && (
                <div className="h-32 bg-on-surface text-white p-6 font-mono text-xs border-t border-outline-variant/10 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2 text-brand-emerald">
                    <span className="material-symbols-outlined text-sm">terminal</span>
                    <span className="font-bold font-headline uppercase tracking-widest">Output Console</span>
                  </div>
                  {running ? (
                    <p className="text-yellow-300 animate-pulse">&gt; Executing your code...</p>
                  ) : runResult ? (
                    <pre className={`whitespace-pre-wrap break-words ${getStatusColor(runResult.status)}`}>
                      {outputText}
                    </pre>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Whiteboard */}
          {activeTab === 'whiteboard' && (
            <div className="flex-grow bg-white rounded-lg editorial-shadow overflow-hidden relative">
              <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none', cursor: 'crosshair' }} />
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white rounded-lg shadow-md p-2 border border-outline-variant/10">
                {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#ffffff'].map(color => (
                  <button key={color} onClick={() => setBrushColor(color)} className="w-7 h-7 rounded-full border-2 shadow transition"
                    style={{ backgroundColor: color, borderColor: brushColor === color ? '#6366f1' : '#e5e7eb', transform: brushColor === color ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
                <div className="w-px h-6 bg-outline-variant/20 mx-1" />
                {[2, 5, 10].map(size => (
                  <button key={size} onClick={() => setBrushSize(size)} className={`rounded-full bg-gray-300 transition ${brushSize === size ? 'ring-2 ring-brand-indigo' : ''}`}
                    style={{ width: size * 2 + 8, height: size * 2 + 8 }} />
                ))}
                <div className="w-px h-6 bg-outline-variant/20 mx-1" />
                <button onClick={clearCanvas} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 font-headline font-bold">Clear</button>
              </div>
            </div>
          )}
        </section>

        {/* ═══ RIGHT SIDEBAR: VIDEO & AI ═══ */}
        <section className="col-span-4 bg-surface-container-low border-l border-outline-variant/10 p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Video Feeds */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative bg-on-surface rounded-xl overflow-hidden editorial-shadow group" style={{ aspectRatio: '1' }}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div ref={localOverlayRef} className="absolute inset-0 flex items-center justify-center bg-on-surface" style={{ opacity: 1, zIndex: 10, transition: 'opacity 0.2s' }}>
                <span className="text-white text-sm font-headline font-bold">You</span>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[10px] text-white font-bold font-headline uppercase tracking-wider">You</div>
            </div>
            <div className="relative bg-on-surface rounded-xl overflow-hidden editorial-shadow group" style={{ aspectRatio: '1' }}>
              <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div ref={remoteOverlayRef} className="absolute inset-0 flex items-center justify-center bg-on-surface" style={{ opacity: 1, zIndex: 10, transition: 'opacity 0.2s' }}>
                <span className="text-white text-sm font-headline font-bold">Interviewer</span>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[10px] text-white font-bold font-headline uppercase tracking-wider">Interviewer</div>
            </div>
          </div>

          {/* Screen Share */}
          <div className="relative bg-on-surface rounded-xl overflow-hidden editorial-shadow" style={{ aspectRatio: '16/9' }}>
            <video ref={screenVideoRef} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
            <div ref={screenOverlayRef} className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 text-xs gap-1" style={{ opacity: 1, background: '#111827', zIndex: 10, transition: 'opacity 0.2s' }}>
              <span className="text-2xl">🖥</span>
              <span>No screen share</span>
            </div>
            {(screenSharing || remoteScreenActive) && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-bold z-20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE
              </div>
            )}
          </div>

          {/* AI Insights */}
          <div className="space-y-2">
            <h3 className="font-headline font-black text-lg text-brand-indigo flex items-center gap-2 uppercase tracking-tighter">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              AI Technical Insights
            </h3>
            <p className="text-xs text-on-surface-variant font-body">Real-time performance metrics and architectural feedback.</p>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-xl border border-outline-variant/10 editorial-shadow">
              <span className="text-[9px] font-bold font-headline text-on-surface-variant uppercase tracking-widest block mb-2">Code Efficiency</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-black text-on-surface font-headline">92%</span>
                <span className="text-[10px] text-brand-emerald font-bold font-headline mb-1">+4%</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-outline-variant/10 editorial-shadow">
              <span className="text-[9px] font-bold font-headline text-on-surface-variant uppercase tracking-widest block mb-2">Comm. Score</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-black text-on-surface font-headline">88</span>
                <span className="text-[10px] text-brand-indigo font-bold font-headline mb-1">High</span>
              </div>
            </div>
          </div>

          {/* Feedback Cards */}
          <div className="space-y-3">
            <div className="bg-brand-indigo/[0.03] p-4 rounded-xl border-l-4 border-brand-indigo">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold font-headline uppercase text-brand-indigo tracking-widest">Logic Insight</span>
                <span className="text-[10px] text-on-surface-variant">Just now</span>
              </div>
              <p className="text-xs text-on-surface leading-relaxed">
                The candidate is correctly using <span className="font-bold text-brand-indigo">Recursive Depth-First Search</span>.
              </p>
            </div>
            <div className="bg-brand-emerald/[0.03] p-4 rounded-xl border-l-4 border-brand-emerald">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold font-headline uppercase text-brand-emerald tracking-widest">Optimization</span>
                <span className="text-[10px] text-on-surface-variant">2m ago</span>
              </div>
              <p className="text-xs text-on-surface leading-relaxed">
                Consider <span className="font-bold text-brand-emerald">Iterative BFS</span> for memory optimization.
              </p>
            </div>
          </div>

          {/* AI Feedback Button */}
          <button onClick={getAIFeedback} disabled={loadingFeedback} className="w-full py-3 bg-brand-indigo text-white rounded-lg font-headline font-bold text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
            {loadingFeedback ? '⏳ Analyzing...' : '✨ Get AI Feedback'}
          </button>
        </section>
      </main>

      {/* ═══ BOTTOM NAV ═══ */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-center items-center space-x-12 px-12 z-50 bg-white/90 backdrop-blur-2xl h-16 border-t border-outline-variant/10">
        <div className="flex items-center space-x-8">
          <button onClick={toggleMute} disabled={!micReady} className={`flex flex-col items-center justify-center transition-transform active:scale-95 duration-150 ${!micReady ? 'opacity-50 cursor-not-allowed' : muted ? 'text-red-600' : 'text-on-surface-variant hover:text-brand-indigo'}`}>
            <span className="material-symbols-outlined">mic</span>
            <span className="font-headline font-bold text-[11px] uppercase tracking-wider">Mic</span>
          </button>
          <button onClick={startVideoCall} disabled={videoActive} className={`flex flex-col items-center justify-center transition-transform hover:scale-110 active:scale-95 duration-150 ${videoActive ? 'text-brand-indigo' : 'text-on-surface-variant hover:text-brand-indigo'}`}>
            <span className="material-symbols-outlined">videocam</span>
            <span className="font-headline font-bold text-[11px] uppercase tracking-wider">Camera</span>
          </button>
          <button onClick={startScreenShare} disabled={shareButtonLocked} className={`bg-brand-indigo text-white rounded-xl px-6 py-2 flex items-center gap-2 hover:scale-110 transition-transform active:scale-95 duration-150 ${shareButtonLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>screen_share</span>
            <span className="font-headline font-bold text-[11px] uppercase tracking-wider">Share</span>
          </button>
          <button className="flex flex-col items-center justify-center text-on-surface-variant hover:text-brand-indigo transition-transform hover:scale-110 active:scale-95 duration-150">
            <span className="material-symbols-outlined">radio_button_checked</span>
            <span className="font-headline font-bold text-[11px] uppercase tracking-wider">Record</span>
          </button>
        </div>
        <div className="h-8 w-px bg-outline-variant/20 mx-4"></div>
        <button className="flex items-center gap-3 px-6 py-2 bg-red-500 text-white rounded-xl font-headline font-bold text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-md shadow-red-500/20">
          <span className="material-symbols-outlined text-sm">call_end</span>
          Leave
        </button>
      </nav>
    </div>
  )
}
