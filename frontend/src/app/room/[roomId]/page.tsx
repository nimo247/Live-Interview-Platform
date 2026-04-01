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

type DisplayMediaStreamOptions = {
  video: { width?: { ideal?: number }; height?: { ideal?: number } }
  audio: boolean
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
  const [code, setCode] = useState('import math\n\nclass GraphAnalyzer:\n    def __init__(self, nodes):\n        self.nodes = nodes\n        self.adj = {i: [] for i in range(nodes)}\n\n    # Find shortest path using Dijkstra\n    def shortest_path(self, start, end):\n        distances = {node: float(\'inf\') for node in self.nodes}\n        distances[start] = 0\n        priority_queue = [(0, start)]\n')
  const [language, setLanguage] = useState('python')
  const [activeTab, setActiveTab] = useState<'code' | 'console'>('code')
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Video & Audio States
  const [videoActive, setVideoActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [remoteScreenActive, setRemoteScreenActive] = useState(false)

  // Chat States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'Sarah Jenkins', text: 'Could you clarify the memory constraints for the adjacency list?', time: '10:23', self: false },
    { sender: 'You', text: 'Assume standard O(V+E) space is acceptable.', time: '10:24', self: true },
    { sender: 'Sarah Jenkins', text: 'Perfect, thank you!', time: '10:25', self: false },
  ])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Code Execution States
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const [stdinInput, setStdinInput] = useState('')
  const [showStdin, setShowStdin] = useState(false)

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(1458)
  const [timerRunning, setTimerRunning] = useState(true)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecondsRef = useRef(1458)

  // Drawing States
  const [brushColor, setBrushColor] = useState('#c0c1ff')
  const [brushSize, setBrushSize] = useState(3)
  const [feedback, setFeedback] = useState('Candidate is implementing Min-Heap Dijkstra. Suggest asking about handling negative edge weights if performance stays high.')
  const [loadingFeedback, setLoadingFeedback] = useState(false)

  // Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Peer & Stream Refs
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Drawing Refs
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Timer effect
  useEffect(() => {
    if (!timerRunning) return
    timerIntervalRef.current = setInterval(() => {
      timerSecondsRef.current += 1
      setTimerSeconds(timerSecondsRef.current)
    }, 1000)
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [timerRunning])

  // Format time for timer
  const formatTime = useCallback((secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0')
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }, [])

  // Add notification
  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 3000)
  }, [])

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
    addNotification('Copied to clipboard!', 'success')
  }, [code, addNotification])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setMuted(!muted)
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
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      } as DisplayMediaStreamOptions)
      screenStreamRef.current = stream
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
      }
      setScreenSharing(true)
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
    addNotification('Screen sharing stopped', 'info')
  }, [addNotification])

  return (
    <div className="h-screen flex flex-col bg-[#0b1326] text-on-surface selection:bg-primary/30 min-h-screen overflow-hidden font-body">
      <style>{`
        body { font-family: 'Inter', sans-serif; }
        .font-headline { font-family: 'Space Grotesk', sans-serif; }
        .glass-panel {
          background: rgba(34, 42, 61, 0.6);
          backdrop-filter: blur(12px);
        }
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #31394d; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #464554; }
        .slate-surface { background: #0b1326; }
        .slate-container-low { background: #131b2e; }
        .slate-container-high { background: #222a3d; }
      `}</style>

      {/* ═══ TOP NAV BAR ═══ */}
      <nav className="fixed top-0 w-full z-50 bg-[#0b1326]/80 backdrop-blur-xl shadow-[0px_20px_40px_rgba(6,14,32,0.4)] flex justify-between items-center px-8 h-16 border-b border-[#464554]/10">
        <div className="flex items-center gap-12">
          <div className="text-xl font-bold tracking-tighter text-[#c0c1ff] font-headline">InterviewElite</div>
          <div className="hidden md:flex gap-8 items-center font-headline text-sm tracking-wide">
            <a className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors" href="#">Dashboard</a>
            <a className="text-[#c0c1ff] border-b-2 border-[#c0c1ff] pb-1" href="#">Sessions</a>
            <a className="text-[#c7c4d7] hover:text-[#c0c1ff] transition-colors" href="#">Insights</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="px-4 py-1.5 rounded-lg text-sm font-medium text-[#c7c4d7] hover:bg-[#31394d]/50 transition-all active:scale-95">End Session</button>
          <button className="px-5 py-1.5 rounded-lg text-sm font-bold bg-[#8083ff] text-[#0d0096] shadow-lg shadow-[#8083ff]/20 transition-all active:scale-95">Go Live</button>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-[#464554]/30 ml-2 bg-gradient-to-br from-[#4cd7f6] to-[#c0c1ff]" />
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 flex gap-0 pt-16 overflow-hidden">
        
        {/* LEFT SIDEBAR - NAVIGATION & CONSOLE */}
        <aside className="w-64 bg-[#131b2e] flex flex-col border-r border-[#464554]/5 overflow-hidden">
          {/* Toolset Header */}
          <div className="px-6 py-6 border-b border-[#464554]/10">
            <h3 className="font-headline text-xs font-semibold uppercase tracking-[0.05em] text-[#4cd7f6]">Interview Toolset</h3>
            <p className="text-[10px] text-[#c7c4d7]/60 font-medium tracking-wider">Technical Session v2.4</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-[#222a3d]/60 text-[#4cd7f6] border-r-2 border-[#4cd7f6] font-headline text-xs font-semibold uppercase tracking-[0.05em] transition-all duration-300 rounded-r-lg">
              <span className="material-symbols-outlined text-lg">code</span>
              Code Editor
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d] hover:opacity-100 font-headline text-xs font-semibold uppercase tracking-[0.05em] transition-all duration-300">
              <span className="material-symbols-outlined text-lg">videocam</span>
              Video
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d] hover:opacity-100 font-headline text-xs font-semibold uppercase tracking-[0.05em] transition-all duration-300">
              <span className="material-symbols-outlined text-lg">psychology</span>
              AI Insights
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d] hover:opacity-100 font-headline text-xs font-semibold uppercase tracking-[0.05em] transition-all duration-300">
              <span className="material-symbols-outlined text-lg">architecture</span>
              Whiteboard
            </a>
          </nav>

          {/* Console Output */}
          <div className="flex-1 flex flex-col border-t border-[#464554]/10 overflow-hidden">
            <div className="px-6 py-4">
              <h4 className="text-xs font-bold text-[#c0c1ff] uppercase tracking-widest">Session Tools</h4>
            </div>
            <div className="flex-1 px-4 py-3 overflow-y-auto space-y-2 text-[11px] font-mono text-[#c7c4d7]/70">
              <div className="text-green-400">✓ graph_analyzer.py initialized...</div>
              <div className="text-green-400">✓ Running test cases (0/4)</div>
              <div className="text-yellow-400">⚠ Unused variable 'math' on line 1</div>
              <div className="text-green-400">✓ Solution compiling...</div>
            </div>
          </div>
        </aside>

        {/* CENTER - CODE EDITOR */}
        <section className="flex-1 flex flex-col overflow-hidden bg-[#0b1326]">
          {/* Editor Toolbar */}
          <div className="border-b border-[#464554]/10 px-6 py-3 flex items-center justify-between bg-[#131b2e]/40">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-[#222a3d]/50 px-3 py-1.5 rounded-lg border border-[#464554]/20">
                <span className="text-[10px] text-[#c7c4d7]/60 uppercase font-bold tracking-widest">solution.py</span>
                <span className="text-[#4cd7f6] text-xs font-bold ml-2">Python 3.10</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={runCode} disabled={running} className="flex items-center gap-2 px-4 py-1.5 bg-[#4cd7f6] text-[#001f26] rounded-lg font-bold text-xs hover:brightness-110 disabled:opacity-50 transition-all active:scale-95">
                <span className="material-symbols-outlined text-base">{running ? 'hourglass_empty' : 'play_arrow'}</span>
                {running ? 'Running...' : 'Run Code'}
              </button>
              <button onClick={copyCode} className="px-3 py-1.5 bg-[#222a3d]/50 text-[#c7c4d7] rounded-lg hover:bg-[#222a3d] transition-all border border-[#464554]/20">
                <span className="material-symbols-outlined">content_copy</span>
              </button>
              <button onClick={downloadCode} className="px-3 py-1.5 bg-[#222a3d]/50 text-[#c7c4d7] rounded-lg hover:bg-[#222a3d] transition-all border border-[#464554]/20">
                <span className="material-symbols-outlined">download</span>
              </button>
            </div>
          </div>

          {/* Code Editor */}
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language={language}
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                formatOnPaste: true,
                formatOnType: true,
                padding: { top: 16, bottom: 16 },
                fontFamily: 'Fira Code, monospace',
                background: '#0b1326',
              }}
            />
          </div>

          {/* Output Panel */}
          {outputOpen && runResult && (
            <div className="border-t border-[#464554]/10 bg-[#060e20] p-4 max-h-40 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-[#c0c1ff] uppercase tracking-widest">Output</h3>
                <button onClick={() => setOutputOpen(false)} className="text-[#c7c4d7]/60 hover:text-[#c0c1ff]">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <div className="space-y-2 text-[11px] font-mono">
                {runResult.stdout && (
                  <div>
                    <p className="text-[#4cd7f6] font-semibold mb-1">STDOUT:</p>
                    <p className="text-[#c7c4d7]/70 whitespace-pre-wrap">{runResult.stdout}</p>
                  </div>
                )}
                {runResult.stderr && (
                  <div>
                    <p className="text-[#ffb4ab] font-semibold mb-1">STDERR:</p>
                    <p className="text-[#c7c4d7]/70 whitespace-pre-wrap">{runResult.stderr}</p>
                  </div>
                )}
                {runResult.error && <p className="text-[#ffb4ab]">{runResult.error}</p>}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR - VIDEOS & INSIGHTS */}
        <aside className="w-96 bg-[#131b2e] border-l border-[#464554]/5 flex flex-col overflow-hidden">
          {/* Videos Section */}
          <div className="px-6 py-6 space-y-4 border-b border-[#464554]/10">
            {/* Candidate Video */}
            <div className="relative rounded-xl overflow-hidden aspect-video shadow-xl border border-[#464554]/20 bg-[#0b1326]">
              <div className="w-full h-full bg-gradient-to-br from-[#4cd7f6]/20 to-transparent flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 mx-auto mb-3 flex items-center justify-center text-4xl">👨</div>
                  <p className="text-[#c7c4d7] text-sm font-semibold">Sarah Jenkins</p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-80" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-widest uppercase">Sarah Jenkins (Candidate)</span>
              </div>
              <div className="absolute top-3 right-3">
                <div className="glass-panel p-1.5 rounded-lg text-white/90 border border-white/10">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                </div>
              </div>
            </div>

            {/* Interviewer Video */}
            <div className="relative rounded-xl overflow-hidden aspect-video shadow-xl border border-[#464554]/20 bg-[#0b1326]">
              <div className="w-full h-full bg-gradient-to-br from-teal-400/20 to-transparent flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 mx-auto mb-3 flex items-center justify-center text-4xl">👤</div>
                  <p className="text-[#c7c4d7] text-sm font-semibold">David Chen</p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-80" />
              <div className="absolute bottom-3 left-3">
                <span className="text-[10px] font-bold text-white tracking-widest uppercase">David Chen (You)</span>
              </div>
              <div className="absolute top-3 right-3">
                <div className="glass-panel p-1.5 rounded-lg text-white/90 border border-white/10">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                </div>
              </div>
            </div>
          </div>

          {/* Session Intelligence */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="border-b border-[#464554]/10 pb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-headline text-sm font-bold tracking-tight text-[#c0c1ff]">Session Intelligence</h4>
                <span className="px-2 py-0.5 rounded-full bg-[#4cd7f6]/10 text-[#4cd7f6] text-[9px] font-black uppercase tracking-tighter border border-[#4cd7f6]/20">Real-time</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#222a3d]/40 border border-[#464554]/10">
                <div className="text-[10px] text-[#c7c4d7]/60 uppercase font-bold tracking-widest mb-1">Efficiency</div>
                <div className="text-2xl font-headline font-bold text-[#4cd7f6]">92<span className="text-xs text-[#c7c4d7]/40 ml-1">%</span></div>
              </div>
              <div className="p-4 rounded-xl bg-[#222a3d]/40 border border-[#464554]/10">
                <div className="text-[10px] text-[#c7c4d7]/60 uppercase font-bold tracking-widest mb-1">Clarity</div>
                <div className="text-2xl font-headline font-bold text-[#c0c1ff]">85<span className="text-xs text-[#c7c4d7]/40 ml-1">%</span></div>
              </div>
            </div>

            {/* Chat */}
            <div className="border border-[#464554]/10 rounded-xl bg-[#060e20]/50 overflow-hidden h-64 flex flex-col">
              <div className="p-3 border-b border-[#464554]/10 bg-[#131b2e] flex justify-between items-center">
                <span className="text-[10px] font-bold text-[#c7c4d7] uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">chat</span>
                  Session Chat
                </span>
                <span className="w-2 h-2 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col gap-1 ${msg.self ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] text-[#c7c4d7]/60 font-bold">{msg.sender}</span>
                    <div className={`${msg.self ? 'bg-[#4cd7f6]/10 border-[#4cd7f6]/20 text-on-surface' : 'bg-[#222a3d] border-[#464554]/20 text-[#c7c4d7]/90'} px-3 py-2 rounded-2xl ${msg.self ? 'rounded-tr-none' : 'rounded-tl-none'} text-[11px] max-w-[85%] border`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-2 border-t border-[#464554]/10 bg-[#131b2e]">
                <div className="relative">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Send a message..." className="w-full bg-[#060e20] border-none rounded-lg py-2 pl-3 pr-10 text-xs focus:ring-1 focus:ring-[#4cd7f6]/50 placeholder:text-[#c7c4d7]/30" />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4cd7f6] hover:text-[#acedff] transition-colors">
                    <span className="material-symbols-outlined text-lg">send</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Strategy Analysis */}
            <div className="glass-panel p-4 rounded-xl border border-[#464554]/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-base">lightbulb</span>
                <span className="text-[10px] font-bold text-on-surface tracking-widest uppercase">Strategy Analysis</span>
              </div>
              <p className="text-[11px] text-[#c7c4d7] leading-relaxed">
                Candidate is implementing <span className="text-[#4cd7f6] font-semibold">Min-Heap Dijkstra</span>. Suggest asking about handling negative edge weights if performance stays high.
              </p>
            </div>

            {/* Transcript */}
            <div className="pb-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#c7c4d7]/40 uppercase tracking-[0.2em] mb-4">
                <span>Live Transcript</span>
                <span className="material-symbols-outlined text-xs">more_horiz</span>
              </div>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-lg bg-[#222a3d] flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-[#c7c4d7]">SJ</div>
                  <p className="text-[10px] text-[#c7c4d7]/70 leading-tight">"Actually, looking at the constraints, I might need to optimize the priority queue handling..."</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* ═══ FLOATING CONTROL BAR ═══ */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-panel px-6 py-3 rounded-2xl border border-[#464554]/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex items-center gap-8">
        <div className="flex items-center gap-2 border-r border-[#464554]/20 pr-8">
          <button onClick={toggleMute} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#c7c4d7] hover:text-white hover:bg-[#31394d] transition-all group relative">
            <span className="material-symbols-outlined">{muted ? 'mic_off' : 'mic'}</span>
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#222a3d] text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
              {muted ? 'Unmute' : 'Mute'}
            </div>
          </button>
          <button onClick={videoActive ? stopVideo : startVideoCall} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#c7c4d7] hover:text-white hover:bg-[#31394d] transition-all group relative">
            <span className="material-symbols-outlined">{videoActive ? 'videocam_off' : 'videocam'}</span>
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#222a3d] text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
              {videoActive ? 'Stop Camera' : 'Start Camera'}
            </div>
          </button>
          <button onClick={screenSharing ? stopScreenShare : startScreenShare} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#c7c4d7] hover:text-white hover:bg-[#31394d] transition-all group relative">
            <span className="material-symbols-outlined">{screenSharing ? 'stop_circle' : 'screen_share'}</span>
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#222a3d] text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
              {screenSharing ? 'Stop Share' : 'Share Screen'}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-4 border-r border-[#464554]/20 pr-8">
          <div className="text-right">
            <div className="text-[10px] text-[#c7c4d7]/50 font-bold uppercase tracking-widest">Elapsed</div>
            <div className="text-sm font-mono font-bold text-[#4cd7f6]">{formatTime(timerSeconds)}</div>
          </div>
        </div>
        <button className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-red-500/20 shadow-lg shadow-red-500/10">
          Leave Session
        </button>
      </footer>
    </div>
  )
}