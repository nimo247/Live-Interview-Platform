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
  const [code, setCode] = useState('import math\n\nclass GraphAnalyzer:\n    def __init__(self, nodes):\n        self.nodes = nodes\n        self.adj = {i: [] for i in range(nodes)}\n\n    def shortest_path(self, start, end):\n        distances = {node: float(\'inf\') for node in self.nodes}\n        distances[start] = 0\n        priority_queue = [(0, start)]\n')
  const [language, setLanguage] = useState('python')
  const [activeTab, setActiveTab] = useState<'code' | 'console'>('code')
  const [connected, setConnected] = useState(false)

  // Video & Audio States
  const [videoActive, setVideoActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [micReady, setMicReady] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

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

  // Timer States
  const [timerSeconds, setTimerSeconds] = useState(1458)
  const [timerRunning, setTimerRunning] = useState(true)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecondsRef = useRef(1458)

  // Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Format time
  const formatTime = useCallback((secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0')
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }, [])

  // Run code
  const runCode = async () => {
    setRunning(true)
    setOutputOpen(true)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const res = await fetch(`${backendUrl}/rooms/execute`, {
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
        error: 'Could not reach backend.'
      })
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
  }, [code, language])

  // Copy code
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code)
  }, [code])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setMuted(!muted)
  }, [muted])

  // Start video
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setVideoActive(true)
    } catch (e) {
      console.error('Camera error:', e)
    }
  }

  // Stop video
  const stopVideo = useCallback(() => {
    if (localVideoRef.current?.srcObject) {
      const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
      localVideoRef.current.srcObject = null
    }
    setVideoActive(false)
  }, [])

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      } as DisplayMediaStreamOptions)
      setScreenSharing(true)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare()
      }
    } catch (e) {
      console.error('Screen share error:', e)
    }
  }

  // Stop screen share
  const stopScreenShare = useCallback(() => {
    setScreenSharing(false)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[#0b1326] text-[#dae2fd] overflow-hidden">
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
      `}</style>

      {/* ═══ TOP NAV BAR ═══ */}
      <nav className="fixed top-0 w-full z-50 bg-[#0b1326]/95 backdrop-blur-xl border-b border-[#464554]/10 px-8 py-4 flex justify-between items-center h-20 shadow-lg">
        <div className="flex items-center gap-16">
          <div className="text-2xl font-bold tracking-tight text-[#c0c1ff] font-headline">InterviewElite</div>
          <div className="hidden lg:flex gap-8 items-center font-headline text-sm tracking-wide">
            <a className="text-[#c7c4d7] hover:text-[#c0c1ff] pb-2 transition-colors" href="#">Dashboard</a>
            <a className="text-[#c0c1ff] border-b-2 border-[#c0c1ff] pb-2" href="#">Sessions</a>
            <a className="text-[#c7c4d7] hover:text-[#c0c1ff] pb-2 transition-colors" href="#">Insights</a>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button className="px-5 py-2 rounded-lg text-sm font-medium text-[#c7c4d7] hover:bg-[#31394d]/50 transition-all">End Session</button>
          <button className="px-6 py-2 rounded-lg text-sm font-bold bg-[#8083ff] text-[#0d0096] hover:brightness-110 shadow-lg shadow-[#8083ff]/30 transition-all">Go Live</button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4cd7f6] to-[#c0c1ff] border border-[#464554]/30" />
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 flex gap-0 pt-20 pb-28 overflow-hidden">
        
        {/* LEFT SIDEBAR */}
        <aside className="w-72 bg-[#131b2e]/80 flex flex-col border-r border-[#464554]/5 overflow-hidden">
          <div className="px-6 py-6 border-b border-[#464554]/10">
            <h3 className="font-headline text-xs font-semibold uppercase tracking-[0.05em] text-[#4cd7f6]">Interview Toolset</h3>
            <p className="text-[11px] text-[#c7c4d7]/60 font-medium tracking-wider mt-1">Technical Session v2.4</p>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
            <a href="#" className="flex items-center gap-4 px-5 py-4 bg-[#222a3d]/80 text-[#4cd7f6] border-r-3 border-[#4cd7f6] font-headline text-sm font-semibold uppercase tracking-widest transition-all rounded-r-xl hover:bg-[#222a3d]">
              <span className="material-symbols-outlined text-2xl">code</span>
              <div>
                <div>Code Editor</div>
                <div className="text-[10px] text-[#c7c4d7]/50 font-normal">Active</div>
              </div>
            </a>
            <a href="#" className="flex items-center gap-4 px-5 py-4 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d]/40 hover:opacity-100 font-headline text-sm font-semibold uppercase tracking-widest transition-all rounded-xl">
              <span className="material-symbols-outlined text-2xl">videocam</span>
              <div>
                <div>Video</div>
                <div className="text-[10px] text-[#c7c4d7]/50 font-normal">Streaming</div>
              </div>
            </a>
            <a href="#" className="flex items-center gap-4 px-5 py-4 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d]/40 hover:opacity-100 font-headline text-sm font-semibold uppercase tracking-widest transition-all rounded-xl">
              <span className="material-symbols-outlined text-2xl">psychology</span>
              <div>
                <div>AI Insights</div>
                <div className="text-[10px] text-[#c7c4d7]/50 font-normal">Real-time</div>
              </div>
            </a>
            <a href="#" className="flex items-center gap-4 px-5 py-4 text-[#c7c4d7] opacity-70 hover:bg-[#222a3d]/40 hover:opacity-100 font-headline text-sm font-semibold uppercase tracking-widest transition-all rounded-xl">
              <span className="material-symbols-outlined text-2xl">architecture</span>
              <div>
                <div>Whiteboard</div>
                <div className="text-[10px] text-[#c7c4d7]/50 font-normal">Collaborative</div>
              </div>
            </a>
          </nav>

          <div className="border-t border-[#464554]/10 px-6 py-6">
            <h4 className="text-xs font-bold text-[#c0c1ff] uppercase tracking-widest mb-4">Session Tools</h4>
            <div className="space-y-2 text-[11px] font-mono text-[#c7c4d7]/70">
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                graph_analyzer.py initialized
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Running test cases (0/4)
              </div>
              <div className="flex items-center gap-2 text-yellow-400">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                Unused variable 'math' on line 1
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Solution compiling...
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER - CODE EDITOR */}
        <section className="flex-1 flex flex-col overflow-hidden bg-[#0b1326]">
          {/* Toolbar */}
          <div className="border-b border-[#464554]/10 px-6 py-4 flex items-center justify-between bg-[#131b2e]/40">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#222a3d]/70 px-4 py-2 rounded-lg border border-[#464554]/30">
                <span className="text-[11px] text-[#c7c4d7]/70 uppercase font-bold tracking-widest">solution.py</span>
                <span className="text-[#4cd7f6] text-xs font-bold ml-3 px-2 py-1 bg-[#4cd7f6]/20 rounded">Python 3.10</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={runCode} disabled={running} className="flex items-center gap-2 px-5 py-2.5 bg-[#4cd7f6] text-[#001f26] rounded-lg font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-[#4cd7f6]/30">
                <span className="material-symbols-outlined">{running ? 'hourglass_empty' : 'play_arrow'}</span>
                {running ? 'Running...' : 'Run Code'}
              </button>
              <button onClick={copyCode} className="flex items-center gap-2 px-4 py-2.5 bg-[#222a3d]/70 text-[#c7c4d7] rounded-lg hover:bg-[#222a3d] transition-all border border-[#464554]/30 tooltip" title="Copy Code">
                <span className="material-symbols-outlined">content_copy</span>
              </button>
              <button onClick={downloadCode} className="flex items-center gap-2 px-4 py-2.5 bg-[#222a3d]/70 text-[#c7c4d7] rounded-lg hover:bg-[#222a3d] transition-all border border-[#464554]/30 tooltip" title="Download">
                <span className="material-symbols-outlined">download</span>
              </button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language={language}
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                formatOnPaste: true,
                padding: { top: 16, bottom: 16 },
              } as any}
            />
          </div>

          {/* Output */}
          {outputOpen && runResult && (
            <div className="border-t border-[#464554]/10 bg-[#060e20]/80 p-4 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#c0c1ff] uppercase tracking-widest">Output</h3>
                <button onClick={() => setOutputOpen(false)} className="text-[#c7c4d7]/60 hover:text-[#c0c1ff]">
                  <span className="material-symbols-outlined">close</span>
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

        {/* RIGHT SIDEBAR */}
        <aside className="w-96 bg-[#131b2e]/80 border-l border-[#464554]/5 flex flex-col overflow-hidden">
          
          {/* Videos */}
          <div className="px-6 py-6 space-y-4 border-b border-[#464554]/10">
            {/* Candidate */}
            <div className="relative rounded-2xl overflow-hidden aspect-video shadow-xl border border-[#464554]/30 bg-gradient-to-br from-orange-500/30 to-transparent">
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 mx-auto mb-3 flex items-center justify-center text-5xl shadow-lg">👨</div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-bold text-white tracking-widest uppercase">Sarah Jenkins</span>
              </div>
              <div className="absolute top-3 right-3">
                <div className="glass-panel p-2 rounded-lg text-white/90 border border-white/20 shadow-lg">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                </div>
              </div>
            </div>

            {/* Interviewer */}
            <div className="relative rounded-2xl overflow-hidden aspect-video shadow-xl border border-[#464554]/30 bg-gradient-to-br from-teal-500/30 to-transparent">
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 mx-auto mb-3 flex items-center justify-center text-5xl shadow-lg">👤</div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-3">
                <span className="text-[11px] font-bold text-white tracking-widest uppercase">David Chen (You)</span>
              </div>
              <div className="absolute top-3 right-3">
                <div className="glass-panel p-2 rounded-lg text-white/90 border border-white/20 shadow-lg">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                </div>
              </div>
            </div>
          </div>

          {/* Session Intelligence */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Header */}
            <div className="border-b border-[#464554]/10 pb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-headline text-base font-bold text-[#c0c1ff]">Session Intelligence</h4>
                <span className="px-3 py-1 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] text-[10px] font-black uppercase tracking-tight border border-[#4cd7f6]/30">Real-time</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-[#222a3d]/60 border border-[#464554]/20 hover:border-[#4cd7f6]/40 transition-all">
                <div className="text-[10px] text-[#c7c4d7]/60 uppercase font-bold tracking-widest mb-2">Efficiency</div>
                <div className="text-3xl font-headline font-bold text-[#4cd7f6]">92<span className="text-xs text-[#c7c4d7]/40 ml-1">%</span></div>
              </div>
              <div className="p-5 rounded-xl bg-[#222a3d]/60 border border-[#464554]/20 hover:border-[#c0c1ff]/40 transition-all">
                <div className="text-[10px] text-[#c7c4d7]/60 uppercase font-bold tracking-widest mb-2">Clarity</div>
                <div className="text-3xl font-headline font-bold text-[#c0c1ff]">85<span className="text-xs text-[#c7c4d7]/40 ml-1">%</span></div>
              </div>
            </div>

            {/* Chat */}
            <div className="border border-[#464554]/20 rounded-2xl bg-[#060e20]/60 overflow-hidden h-72 flex flex-col">
              <div className="p-4 border-b border-[#464554]/20 bg-[#131b2e]/80 flex justify-between items-center">
                <span className="text-[11px] font-bold text-[#c7c4d7] uppercase tracking-widest flex items-center gap-3">
                  <span className="material-symbols-outlined">chat</span>
                  Session Chat
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col gap-1.5 ${msg.self ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-[#c7c4d7]/60 font-bold px-1">{msg.sender}</span>
                    <div className={`${msg.self ? 'bg-[#4cd7f6]/15 border-[#4cd7f6]/30 text-[#dae2fd]' : 'bg-[#222a3d]/80 border-[#464554]/30 text-[#c7c4d7]/90'} px-4 py-3 rounded-2xl ${msg.self ? 'rounded-tr-none' : 'rounded-tl-none'} text-[12px] max-w-[85%] border`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-[#464554]/20 bg-[#131b2e]/80">
                <div className="relative flex items-center">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Send a message..." className="w-full bg-[#060e20]/80 border border-[#464554]/30 rounded-xl py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#4cd7f6]/50 placeholder:text-[#c7c4d7]/30 transition-all" />
                  <button className="absolute right-3 text-[#4cd7f6] hover:text-[#acedff] transition-colors">
                    <span className="material-symbols-outlined text-xl">send</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Strategy */}
            <div className="glass-panel p-5 rounded-2xl border border-[#464554]/20">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#4cd7f6] text-2xl">lightbulb</span>
                <span className="text-[11px] font-bold text-[#dae2fd] tracking-widest uppercase">Strategy Analysis</span>
              </div>
              <p className="text-[12px] text-[#c7c4d7]/90 leading-relaxed">
                Candidate is implementing <span className="text-[#4cd7f6] font-semibold">Min-Heap Dijkstra</span>. Suggest asking about handling negative edge weights if performance stays high.
              </p>
            </div>

            {/* Transcript */}
            <div className="pb-4">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#c7c4d7]/40 uppercase tracking-[0.15em] mb-3">
                <span>Live Transcript</span>
                <span className="material-symbols-outlined text-sm cursor-pointer hover:text-[#c7c4d7]/60">more_horiz</span>
              </div>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#222a3d]/80 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-[#c7c4d7] border border-[#464554]/30">SJ</div>
                  <p className="text-[12px] text-[#c7c4d7]/70 leading-relaxed">"Actually, looking at the constraints, I might need to optimize the priority queue handling..."</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* ═══ FLOATING CONTROL BAR ═══ */}
      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-panel px-8 py-4 rounded-3xl border border-[#464554]/30 shadow-2xl flex items-center gap-8">
        
        {/* Media Controls */}
        <div className="flex items-center gap-3 border-r border-[#464554]/30 pr-8">
          {/* Mic Button */}
          <button 
            onClick={toggleMute}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg group relative ${
              muted 
                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-600/40' 
                : 'bg-[#4cd7f6]/20 text-[#4cd7f6] hover:bg-[#4cd7f6]/40 border border-[#4cd7f6]/40'
            }`}
            title={muted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            <span className="material-symbols-outlined text-2xl">{muted ? 'mic_off' : 'mic'}</span>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-2 bg-[#222a3d] text-[11px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-[#464554]/50 shadow-lg">
              {muted ? 'Unmute' : 'Mute'}
            </div>
          </button>

          {/* Camera Button */}
          <button 
            onClick={videoActive ? stopVideo : startVideoCall}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg group relative ${
              videoActive 
                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-600/40' 
                : 'bg-[#4cd7f6]/20 text-[#4cd7f6] hover:bg-[#4cd7f6]/40 border border-[#4cd7f6]/40'
            }`}
            title={videoActive ? 'Stop Camera' : 'Start Camera'}
          >
            <span className="material-symbols-outlined text-2xl">{videoActive ? 'videocam_off' : 'videocam'}</span>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-2 bg-[#222a3d] text-[11px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-[#464554]/50 shadow-lg">
              {videoActive ? 'Stop Camera' : 'Start Camera'}
            </div>
          </button>

          {/* Screen Share Button */}
          <button 
            onClick={screenSharing ? stopScreenShare : startScreenShare}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg group relative ${
              screenSharing 
                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-600/40' 
                : 'bg-[#4cd7f6]/20 text-[#4cd7f6] hover:bg-[#4cd7f6]/40 border border-[#4cd7f6]/40'
            }`}
            title={screenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
          >
            <span className="material-symbols-outlined text-2xl">{screenSharing ? 'stop_circle' : 'screen_share'}</span>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-2 bg-[#222a3d] text-[11px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-[#464554]/50 shadow-lg">
              {screenSharing ? 'Stop Share' : 'Share Screen'}
            </div>
          </button>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-6 border-r border-[#464554]/30 pr-8">
          <div className="text-center">
            <div className="text-[10px] text-[#c7c4d7]/50 font-bold uppercase tracking-widest">Elapsed</div>
            <div className="text-lg font-mono font-bold text-[#4cd7f6] mt-1">{formatTime(timerSeconds)}</div>
          </div>
        </div>

        {/* Leave Button */}
        <button className="px-8 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] transition-all border border-red-600/40 shadow-lg hover:shadow-red-600/20 font-headline">
          Leave Session
        </button>
      </footer>
    </div>
  )
}