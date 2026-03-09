'use client'
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
  const isRemoteChange = useRef(false)

  useEffect(() => {
    const socket = getSocket()

    // Connect and join room
    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join_room', { room_id: roomId, username })
    })

    socket.on('disconnect', () => setConnected(false))

    // Room joined — get current state
    socket.on('room_joined', (data: any) => {
      isRemoteChange.current = true
      setCode(data.code)
      setLanguage(data.language)
      setParticipants(data.participants)
      isRemoteChange.current = false
    })

    // Someone else joined
    socket.on('user_joined', (data: any) => {
      setParticipants(data.participants)
      setMessages(prev => [...prev, `✅ ${data.username} joined`])
    })

    // Someone left
    socket.on('user_left', () => {
      setParticipants(prev => Math.max(1, prev - 1))
      setMessages(prev => [...prev, `❌ A user left`])
    })

    // Code updated by someone else
    socket.on('code_updated', (data: any) => {
      isRemoteChange.current = true
      setCode(data.code)
      isRemoteChange.current = false
    })

    // Language updated by someone else
    socket.on('language_updated', (data: any) => {
      setLanguage(data.language)
    })

    return () => {
      disconnectSocket()
    }
  }, [roomId, username])

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
          <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center text-gray-500 text-sm">
            🎥 Your Video
          </div>
          <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center text-gray-500 text-sm">
            👤 Participant
          </div>
          <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition">
            Start Video Call
          </button>
          <button className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition">
            🎤 Mute
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
              <canvas id="whiteboard" className="w-full h-full" style={{ touchAction: 'none' }} />
              <div className="absolute top-3 left-3 flex gap-2">
                {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b'].map(color => (
                  <button
                    key={color}
                    className="w-7 h-7 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: color }}
                  />
                ))}
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