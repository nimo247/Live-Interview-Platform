'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [roomId, setRoomId] = useState('')
  const [loading, setLoading] = useState(false)

  const createRoom = async () => {
    if (!username.trim()) return alert('Enter your name first!')
    setLoading(true)
    const res = await fetch('http://localhost:8000/rooms/create', { method: 'POST' })
    const data = await res.json()
    router.push(`/room/${data.room_id}?username=${username}`)
  }

  const joinRoom = () => {
    if (!username.trim()) return alert('Enter your name first!')
    if (!roomId.trim()) return alert('Enter a room ID!')
    router.push(`/room/${roomId.toUpperCase()}?username=${username}`)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">💻 Interview Platform</h1>
          <p className="text-gray-400">Real-time technical interviews</p>
        </div>

        {/* Username Input */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Your Name</label>
          <input
            type="text"
            placeholder="Enter your name..."
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Create Room */}
        <button
          onClick={createRoom}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition mb-4"
        >
          {loading ? 'Creating...' : '🚀 Create New Room'}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-sm">or join existing</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Join Room */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Room ID..."
            value={roomId}
            onChange={e => setRoomId(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 uppercase"
          />
          <button
            onClick={joinRoom}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition"
          >
            Join
          </button>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          {[
            { icon: '🎥', text: 'Video Call' },
            { icon: '💻', text: 'Live Code Editor' },
            { icon: '🎨', text: 'Whiteboard' },
            { icon: '🤖', text: 'AI Feedback' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-2 text-gray-400 text-sm bg-gray-800 px-3 py-2 rounded-lg">
              <span>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

      </div>
    </main>
  )
}