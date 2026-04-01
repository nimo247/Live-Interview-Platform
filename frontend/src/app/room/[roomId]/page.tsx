'use client'
import SimplePeer from 'simple-peer'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
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

interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

const EXTENSIONS: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py',
  java: 'java', cpp: 'cpp', go: 'go', rust: 'rs', c: 'c',
}

const LANGUAGE_OPTIONS = [
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'C', value: 'c' },
]

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.roomId as string
  const username = searchParams.get('username') || 'Anonymous'

  // Core States
  const [code, setCode] = useState('// Start coding here\n')
  const [language, setLanguage] = useState('javascript')
  const [activeTab, setActiveTab] = useState<'code' | 'whiteboard'>('code')
  const [participants, setParticipants] = useState(1)
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Video & Audio States
  const [videoActive, setVideoActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [remoteScreenActive, setRemoteScreenActive] = useState(false)

  // Chat States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Code Execution States
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const [stdinInput, setStdinInput] = useState('')
  const [showStdin, setShowStdin] = useState(false)

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerInput, setTimerInput] = useState('45')
  const [showTimerInput, setShowTimerInput] = useState(false)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecondsRef = useRef(0)

  // Drawing States
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(3)
  const [feedback, setFeedback] = useState('')
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [copied, setCopied] = useState(false)

  // Settings & UI States
  const [showSettings, setShowSettings] = useState(false)
  const [codeTheme, setCodeTheme] = useState<'light' | 'dark'>('dark')
  const [fontSize, setFontSize] = useState(14)

  // Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Overlay Refs
  const localOverlayRef = useRef<HTMLDivElement>(null)
  const remoteOverlayRef = useRef<HTMLDivElement>(null)
  const screenOverlayRef = useRef<HTMLDivElement>(null)

  // Peer & Stream Refs
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const audioPeerRef = useRef<SimplePeer.Instance | null>(null)
  const screenPeerRef = useRef<SimplePeer.Instance | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Drawing Refs
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const isRemoteChange = useRef(false)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Add notification
  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 3000)
  }, [])

  // Format time for timer
  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [])

  // Start timer
  const startTimerAt = useCallback((seconds: number) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
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
        addNotification('Time\'s up!', 'warning')
      }
    }, 1000)
  }, [addNotification])

  // Run code
  const runCode = async () => {
    setRunning(true)
    setOutputOpen(true)
    setRunResult(null)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const res = await fetch(`${backendUrl}/rooms/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin: stdinInput })
      })
      const data = await res.json()
      setRunResult(data)
      addNotification('Code executed successfully', 'success')
    } catch (e) {
      setRunResult({
        stdout: '', stderr: '', compile_output: '',
        status: 'Error', time: null, memory: null,
        error: 'Could not reach backend. Is it running?'
      })
      addNotification('Execution failed', 'error')
    } finally {
      setRunning(false)
    }
  }

  // Download code
  const downloadCode = useCallback(() => {
    const ext = EXTENSIONS[language] || 'txt'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `solution.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    addNotification('Code downloaded!', 'success')
  }, [code, language, addNotification])

  // Copy code to clipboard
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    addNotification('Copied to clipboard!', 'success')
    setTimeout(() => setCopied(false), 2000)
  }, [code, addNotification])

  // Get AI feedback (placeholder)
  const getAIFeedback = async () => {
    setLoadingFeedback(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      setFeedback('Your code demonstrates strong algorithmic thinking with proper use of data structures.')
      addNotification('AI feedback generated', 'success')
    } catch (e) {
      addNotification('Failed to get AI feedback', 'error')
    } finally {
      setLoadingFeedback(false)
    }
  }

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = muted
      })
      setMuted(!muted)
    }
  }, [muted])

  // Start video call
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setVideoActive(true)
      addNotification('Camera started', 'success')
    } catch (e) {
      addNotification('Camera access denied', 'error')
    }
  }

  // Stop video
  const stopVideo = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    setVideoActive(false)
    addNotification('Camera stopped', 'info')
  }, [addNotification])

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      })
      screenStreamRef.current = stream
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
      }
      setScreenSharing(true)
      if (screenOverlayRef.current) {
        screenOverlayRef.current.style.opacity = '0'
      }
      addNotification('Screen sharing started', 'success')

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare()
      }
    } catch (e) {
      addNotification('Screen share denied', 'error')
    }
  }

  // Stop screen share
  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop())
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null
    }
    setScreenSharing(false)
    if (screenOverlayRef.current) {
      screenOverlayRef.current.style.opacity = '1'
    }
    addNotification('Screen sharing stopped', 'info')
  }, [addNotification])

  // Clear canvas
  const clearCanvas = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }
  }, [])

  // Handle drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    lastPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
    isDrawing.current = true
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current || !lastPos.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()

    lastPos.current = { x, y }
  }

  const handleMouseUp = () => {
    isDrawing.current = false
    lastPos.current = null
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault()
          runCode()
        } else if (e.key === 's') {
          e.preventDefault()
          downloadCode()
        } else if (e.key === 'c' && e.shiftKey) {
          e.preventDefault()
          copyCode()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runCode, downloadCode, copyCode])

  // Timer effect
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  // Memoized color palette
  const colors = useMemo(() => ['#000000', '#FFFFFF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3'], [])

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden font-sans">
      {/* ═══ HEADER ═══ */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">IE</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Interview Elite</h1>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowTimerInput(!showTimerInput)} className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${timerRunning ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            ⏱ {formatTime(timerSeconds)}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full" />
        </div>
      </header>

      {/* ═══ SETTINGS PANEL ═══ */}
      {showSettings && (
        <div className="absolute top-16 right-6 bg-white rounded-xl shadow-2xl p-6 w-80 z-40 border border-slate-200">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">settings</span>Settings
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">Code Theme</label>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map(theme => (
                  <button
                    key={theme}
                    onClick={() => setCodeTheme(theme)}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all ${codeTheme === theme ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">Font Size: {fontSize}px</label>
              <input
                type="range"
                min="10"
                max="20"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ═══ NOTIFICATIONS ═══ */}
      <div className="fixed top-20 right-6 z-50 space-y-2">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-right-4 ${
              notif.type === 'success' ? 'bg-green-100 text-green-800' :
              notif.type === 'error' ? 'bg-red-100 text-red-800' :
              notif.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
              'bg-blue-100 text-blue-800'
            }`}
          >
            {notif.message}
          </div>
        ))}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="col-span-2 bg-white border-r border-slate-200/50 flex flex-col overflow-hidden">
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {[
              { icon: 'code', label: 'Editor', tab: 'code' },
              { icon: 'edit', label: 'Whiteboard', tab: 'whiteboard' },
              { icon: 'chat', label: 'Chat', action: () => setShowChat(!showChat) },
              { icon: 'terminal', label: 'Terminal', active: false }
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  if ('tab' in item) setActiveTab(item.tab as any)
                  if ('action' in item && item.action) item.action()
                }}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-3 ${
                  activeTab === item.tab || showChat
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* EDITOR SECTION */}
        <section className={`${showChat ? 'col-span-7' : 'col-span-8'} bg-white border-r border-slate-200/50 flex flex-col overflow-hidden transition-all`}>
          {/* Editor Toolbar */}
          <div className="border-b border-slate-200/50 p-4 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LANGUAGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={runCode}
                disabled={running}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
              >
                <span className="material-symbols-outlined">{running ? 'hourglass_empty' : 'play_arrow'}</span>
                {running ? 'Running...' : 'Run'}
              </button>
              <button
                onClick={copyCode}
                className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
              >
                <span className="material-symbols-outlined text-base">{copied ? 'check' : 'content_copy'}</span>
              </button>
              <button
                onClick={downloadCode}
                className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-300 transition-all"
              >
                <span className="material-symbols-outlined">download</span>
              </button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'code' ? (
              <MonacoEditor
                height="100%"
                language={language}
                value={code}
                onChange={(value) => setCode(value || '')}
                theme={codeTheme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  fontSize,
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  formatOnPaste: true,
                  formatOnType: true,
                }}
              />
            ) : (
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                width={window.innerWidth}
                height={window.innerHeight}
                className="w-full h-full bg-white cursor-crosshair"
              />
            )}
          </div>

          {/* Output Panel */}
          {outputOpen && runResult && (
            <div className="border-t border-slate-200/50 bg-slate-900 text-white p-4 max-h-64 overflow-y-auto font-mono text-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Output</h3>
                <button
                  onClick={() => setOutputOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              {runResult.stdout && (
                <div className="mb-3">
                  <p className="text-green-400 font-semibold mb-1">STDOUT:</p>
                  <p className="text-slate-300 whitespace-pre-wrap">{runResult.stdout}</p>
                </div>
              )}
              {runResult.stderr && (
                <div className="mb-3">
                  <p className="text-red-400 font-semibold mb-1">STDERR:</p>
                  <p className="text-slate-300 whitespace-pre-wrap">{runResult.stderr}</p>
                </div>
              )}
              {runResult.error && (
                <p className="text-red-400">{runResult.error}</p>
              )}
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR - VIDEO & AI */}
        <section className={`${showChat ? 'col-span-3' : 'col-span-2'} bg-gradient-to-b from-slate-50 to-slate-100 border-l border-slate-200/50 p-4 flex flex-col gap-4 overflow-y-auto transition-all`}>
          {/* Video Feeds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative bg-slate-800 rounded-xl overflow-hidden shadow-lg group" style={{ aspectRatio: '1' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div
                ref={localOverlayRef}
                className="absolute inset-0 flex items-center justify-center bg-slate-900/90 transition-opacity"
                style={{ opacity: videoActive ? 0 : 1 }}
              >
                <span className="material-symbols-outlined text-white text-4xl">videocam_off</span>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded text-xs text-white font-bold">YOU</div>
            </div>
            <div className="relative bg-slate-800 rounded-xl overflow-hidden shadow-lg group" style={{ aspectRatio: '1' }}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div
                ref={remoteOverlayRef}
                className="absolute inset-0 flex items-center justify-center bg-slate-900/90 transition-opacity"
              >
                <span className="material-symbols-outlined text-white text-4xl">person</span>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded text-xs text-white font-bold">INTERVIEWER</div>
            </div>
          </div>

          {/* Screen Share */}
          <div className="relative bg-slate-800 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '16/9' }}>
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
            <div
              ref={screenOverlayRef}
              className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 transition-opacity"
              style={{ opacity: 1, background: '#1e293b' }}
            >
              <span className="material-symbols-outlined text-4xl mb-2">desktop_mac</span>
              <span className="text-xs font-medium">No screen share</span>
            </div>
            {screenSharing && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-3 py-1 rounded-full font-bold z-20 flex items-center gap-2 animate-pulse">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />LIVE
              </div>
            )}
          </div>

          {/* AI Insights */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 className="font-bold text-sm text-blue-600 flex items-center gap-2 mb-2 uppercase tracking-wide">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>AI Insights
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Real-time performance metrics and technical feedback.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-200">
                <span className="text-[9px] font-bold text-blue-700 block mb-1 uppercase tracking-wider">Efficiency</span>
                <span className="text-lg font-black text-blue-900">92%</span>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-200">
                <span className="text-[9px] font-bold text-green-700 block mb-1 uppercase tracking-wider">Score</span>
                <span className="text-lg font-black text-green-900">88</span>
              </div>
            </div>
            <button
              onClick={getAIFeedback}
              disabled={loadingFeedback}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95"
            >
              {loadingFeedback ? '⏳ Analyzing...' : '✨ Get Feedback'}
            </button>
          </div>
        </section>

        {/* CHAT SIDEBAR */}
        {showChat && (
          <aside className="col-span-3 bg-white border-r border-slate-200/50 flex flex-col overflow-hidden">
            <div className="border-b border-slate-200/50 p-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined">chat</span>Discussion
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.self ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                      msg.self
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-100 text-slate-900 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-slate-200/50 p-4 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    setChatMessages([...chatMessages, { sender: username, text: chatInput, time: new Date().toLocaleTimeString(), self: true }])
                    setChatInput('')
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all">
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </aside>
        )}
      </main>

      {/* ═══ BOTTOM CONTROL BAR ═══ */}
      <nav className="bg-white border-t border-slate-200/50 px-6 py-4 flex items-center justify-center gap-8 shadow-lg">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMute}
            disabled={!micReady}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              !micReady
                ? 'opacity-50 cursor-not-allowed text-slate-400'
                : muted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <span className="material-symbols-outlined">{muted ? 'mic_off' : 'mic'}</span>
            {muted ? 'Mic Off' : 'Mic On'}
          </button>

          <button
            onClick={videoActive ? stopVideo : startVideoCall}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              videoActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <span className="material-symbols-outlined">{videoActive ? 'videocam_off' : 'videocam'}</span>
            {videoActive ? 'Cam Off' : 'Cam On'}
          </button>

          <button
            onClick={screenSharing ? stopScreenShare : startScreenShare}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              screenSharing
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <span className="material-symbols-outlined">{screenSharing ? 'stop_circle' : 'screen_share'}</span>
            {screenSharing ? 'Stop Share' : 'Share'}
          </button>

          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
            <span className="material-symbols-outlined">radio_button_checked</span>
            Record
          </button>
        </div>

        <div className="w-px h-8 bg-slate-200" />

        <button className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 transition-all active:scale-95">
          <span className="material-symbols-outlined">call_end</span>
          Leave Call
        </button>
      </nav>
    </div>
  )
}