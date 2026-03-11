'use client'
import SimplePeer from 'simple-peer'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSocket, disconnectSocket } from '@/lib/socket'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
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

  const isRemoteChange = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // ── Socket.IO ─────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join_room', { room_id: roomId, username })
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('room_joined', (data: any) => {
      isRemoteChange.current = true
      setCode(data.code)
      setLanguage(data.language)
      setParticipants(data.participants)
      isRemoteChange.current = false
    })

    socket.on('user_joined', (data: any) => {
      setParticipants(data.participants)
      setMessages(prev => [...prev, `✅ ${data.username} joined`])
    })

    socket.on('user_left', () => {
      setParticipants(prev => Math.max(1, prev - 1))
      setMessages(prev => [...prev, `❌ A user left`])
    })

    socket.on('code_updated', (data: any) => {
      isRemoteChange.current = true
      setCode(data.code)
      isRemoteChange.current = false
    })

    socket.on('language_updated', (data: any) => {
      setLanguage(data.language)
    })

    socket.on('webrtc_offer', (data: any) => {
      if (peerRef.current) peerRef.current.signal(data.sdp)
    })

    socket.on('webrtc_answer', (data: any) => {
      if (peerRef.current) peerRef.current.signal(data.sdp)
    })

    // Remote whiteboard drawing
    socket.on('whiteboard_updated', (data: any) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.beginPath()
      ctx.moveTo(data.x1, data.y1)
      ctx.lineTo(data.x2, data.y2)
      ctx.strokeStyle = data.color
      ctx.lineWidth = data.size
      ctx.lineCap = 'round'
      ctx.stroke()
    })

    return () => {
      disconnectSocket()
    }
  }, [roomId, username])

  // ── Whiteboard canvas setup ───────────────────────────────
  useEffect(() => {
    if (activeTab !== 'whiteboard') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    ctx.putImageData(imageData, 0, 0)

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (e instanceof MouseEvent) {
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
      } else {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      }
    }

    const startDraw = (e: MouseEvent | TouchEvent) => {
      isDrawing.current = true
      lastPos.current = getPos(e)
    }

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current || !lastPos.current) return
      const pos = getPos(e)

      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = brushColor
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.stroke()

      const socket = getSocket()
      socket.emit('whiteboard_draw', {
        room_id: roomId,
        x1: lastPos.current.x,
        y1: lastPos.current.y,
        x2: pos.x,
        y2: pos.y,
        color: brushColor,
        size: brushSize,
      })

      lastPos.current = pos
    }

    const stopDraw = () => {
      isDrawing.current = false
      lastPos.current = null
    }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw)
    canvas.addEventListener('touchmove', draw)
    canvas.addEventListener('touchend', stopDraw)

    return () => {
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDraw)
      canvas.removeEventListener('mouseleave', stopDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDraw)
    }
  }, [activeTab, brushColor, brushSize, roomId])

  // ── Code handlers ─────────────────────────────────────────
  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || ''
    setCode(newCode)
    if (!isRemoteChange.current) {
      const socket = getSocket()
      socket.emit('code_change', { room_id: roomId, code: newCode })
    }
  }

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage)
    const socket = getSocket()
    socket.emit('language_change', { room_id: roomId, language: newLanguage })
  }

  // ── WebRTC handlers ───────────────────────────────────────
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      setVideoActive(true)

      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch(console.error)
        }
      }, 100)

      const socket = getSocket()
      const isInitiator = participants <= 1

      const peer = new SimplePeer({ initiator: isInitiator, trickle: false, stream })

      peer.on('signal', (data) => {
        if (data.type === 'offer') {
          socket.emit('webrtc_offer', { sdp: data, room_id: roomId })
        } else if (data.type === 'answer') {
          socket.emit('webrtc_answer', { sdp: data, room_id: roomId })
        }
      })

      peer.on('stream', (remoteStream) => {
        setTimeout(() => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream
            remoteVideoRef.current.play().catch(console.error)
          }
        }, 100)
      })

      peer.on('error', (err) => console.error('Peer error:', err))
      peer.on('connect', () => console.log('Peer connected!'))
      peerRef.current = peer
    } catch (err) {
      alert('Could not access camera/microphone. Please allow permissions!')
    }
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setMuted(prev => !prev)
    }
  }

  const stopVideo = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
    if (peerRef.current) peerRef.current.destroy()
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    setVideoActive(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'go']

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-blue-400 font-bold">💻 Interview Platform</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 text-sm">Room: <span className="text-white font-mono">{roomId}</span></span>
          <button
            onClick={() => navigator.clipboard.writeText(roomId)}
            className="text-xs bg-gray-800 px-2 py-1 rounded hover:bg-gray-700"
          >
            Copy ID
          </button>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">{messages[messages.length - 1]}</span>
          )}
          <span className="text-gray-400 text-sm">👤 {username}</span>
          <span className="text-gray-400 text-sm">🟢 {participants} online</span>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Video */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-3 gap-3">

          {/* Local video */}
          <div className="bg-gray-800 rounded-lg aspect-video overflow-hidden relative">
            {videoActive ? (
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">🎥 Your Video</div>
            )}
          </div>

          {/* Remote video */}
          <div className="bg-gray-800 rounded-lg aspect-video overflow-hidden relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {!videoActive && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">👤 Participant</div>
            )}
          </div>

          {!videoActive ? (
            <button onClick={startVideoCall} className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition">
              🎥 Start Video Call
            </button>
          ) : (
            <button onClick={stopVideo} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition">
              ⏹ Stop Video
            </button>
          )}

          <button
            onClick={toggleMute}
            className={`w-full py-2 rounded-lg text-sm transition ${muted ? 'bg-red-800 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {muted ? '🔇 Unmute' : '🎤 Mute'}
          </button>

          {/* Activity log */}
          <div className="flex-1 overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i} className="text-xs text-gray-500 py-1 border-b border-gray-800">{msg}</div>
            ))}
          </div>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'code' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              💻 Code Editor
            </button>
            <button
              onClick={() => setActiveTab('whiteboard')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'whiteboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              🎨 Whiteboard
            </button>
            {activeTab === 'code' && (
              <select
                value={language}
                onChange={e => handleLanguageChange(e.target.value)}
                className="ml-auto bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700"
              >
                {languages.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}
          </div>

          {/* Code Editor */}
          {activeTab === 'code' && (
            <div className="flex-1">
              <MonacoEditor
                height="100%"
                language={language}
                value={code}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          )}

          {/* Whiteboard */}
          {activeTab === 'whiteboard' && (
            <div className="flex-1 bg-white relative">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ touchAction: 'none', cursor: 'crosshair' }}
              />
              {/* Toolbar */}
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white rounded-lg shadow-md p-2 border border-gray-200">
                {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#ffffff'].map(color => (
                  <button
                    key={color}
                    onClick={() => setBrushColor(color)}
                    className="w-7 h-7 rounded-full border-2 shadow transition"
                    style={{
                      backgroundColor: color,
                      borderColor: brushColor === color ? '#6366f1' : '#e5e7eb',
                      transform: brushColor === color ? 'scale(1.2)' : 'scale(1)'
                    }}
                  />
                ))}
                <div className="w-px h-6 bg-gray-200 mx-1" />
                {[2, 5, 10].map(size => (
                  <button
                    key={size}
                    onClick={() => setBrushSize(size)}
                    className={`rounded-full bg-gray-800 transition ${brushSize === size ? 'ring-2 ring-blue-500' : ''}`}
                    style={{ width: size * 2 + 8, height: size * 2 + 8 }}
                  />
                ))}
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <button
                  onClick={clearCanvas}
                  className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right — AI Feedback */}
        <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="p-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300">🤖 AI Feedback</h3>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="text-gray-500 text-sm text-center mt-8">
              Write some code and click "Get Feedback" to receive AI analysis
            </div>
          </div>
          <div className="p-3 border-t border-gray-800">
            <button className="w-full py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition">
              ✨ Get AI Feedback
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}