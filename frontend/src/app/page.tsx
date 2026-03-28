'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const createRoom = async () => {
    if (!username.trim()) return setError('Please enter your name first')
    setError('')
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/rooms/create', { method: 'POST' })
      const data = await res.json()
      router.push(`/room/${data.room_id}?username=${encodeURIComponent(username)}`)
    } catch {
      setError('Could not connect to server. Is the backend running?')
      setLoading(false)
    }
  }

  const joinRoom = async () => {
    if (!username.trim()) return setError('Please enter your name first')
    if (!joinCode.trim()) return setError('Please enter a room code')
    setError('')
    setJoining(true)
    router.push(`/room/${joinCode.trim().toUpperCase()}?username=${encodeURIComponent(username)}`)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden" style={{ fontFamily: "'Syne', sans-serif" }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');

        * { box-sizing: border-box; }

        .gradient-text {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #06b6d4 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .card-glow {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          backdrop-filter: blur(20px);
          transition: all 0.3s ease;
        }
        .card-glow:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(99,102,241,0.3);
          box-shadow: 0 0 40px rgba(99,102,241,0.08);
        }

        .btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #818cf8, #a78bfa);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .btn-primary:hover::after { opacity: 1; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 40px rgba(99,102,241,0.4); }
        .btn-primary span { position: relative; z-index: 1; }

        .btn-secondary {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          transition: all 0.3s ease;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.2);
          transform: translateY(-1px);
        }

        .input-field {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          transition: all 0.3s ease;
          color: white;
          font-family: 'JetBrains Mono', monospace;
        }
        .input-field:focus {
          outline: none;
          background: rgba(255,255,255,0.06);
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .input-field::placeholder { color: rgba(255,255,255,0.25); }

        .feature-icon {
          background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
          border: 1px solid rgba(99,102,241,0.2);
        }

        .noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 128px;
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
          pointer-events: none;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .tag {
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.2);
          color: #a5b4fc;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 99px;
        }

        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        }
      `}</style>

      {/* Background effects */}
      <div className="noise-overlay" />
      <div className="orb" style={{ width: 600, height: 600, background: 'radial-gradient(circle, #6366f1, transparent)', top: -100, right: -100 }} />
      <div className="orb" style={{ width: 500, height: 500, background: 'radial-gradient(circle, #8b5cf6, transparent)', bottom: -100, left: -50 }} />
      <div className="orb" style={{ width: 400, height: 400, background: 'radial-gradient(circle, #06b6d4, transparent)', top: '40%', left: '40%', opacity: 0.06 }} />

      {/* Nav */}
      <nav style={{ position: 'relative', zIndex: 10 }} className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>LiveInterview</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>All systems operational</span>
        </div>
      </nav>

      {/* Main */}
      <main style={{ position: 'relative', zIndex: 1 }} className="px-8 pt-20 pb-32 max-w-6xl mx-auto">

        {/* Hero */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 mb-8">
            <span className="tag">v2.0 — Now with code execution</span>
          </div>
          <h1 style={{ fontSize: 'clamp(48px, 7vw, 88px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 24 }}>
            The interview platform<br />
            <span className="gradient-text">built for engineers</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', maxWidth: 520, margin: '0 auto', lineHeight: 1.7, fontWeight: 400 }}>
            Real-time code sync, video, whiteboard, AI feedback and code execution — everything in one room.
          </p>
        </div>

        {/* Main card */}
        <div style={{ maxWidth: 520, margin: '0 auto 80px', borderRadius: 20 }} className="card-glow p-8">

          {/* Name input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Your Name
            </label>
            <input
              type="text"
              placeholder="e.g. Naman"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
              className="input-field w-full px-4 py-3 rounded-xl text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', marginBottom: 16, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)' }}>
              {error}
            </div>
          )}

          {/* Create room button */}
          <button onClick={createRoom} disabled={loading} className="btn-primary w-full py-4 rounded-xl font-semibold text-sm mb-4" style={{ opacity: loading ? 0.7 : 1 }}>
            <span>{loading ? '⏳ Creating room...' : '✦ Create New Room'}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-5">
            <div className="divider flex-1" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono, monospace' }}>or join existing</span>
            <div className="divider flex-1" />
          </div>

          {/* Join room */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Room code (e.g. A1B2C3D4)"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              className="input-field flex-1 px-4 py-3 rounded-xl text-sm"
              style={{ letterSpacing: '0.1em' }}
            />
            <button onClick={joinRoom} disabled={joining} className="btn-secondary px-5 rounded-xl font-semibold text-sm" style={{ whiteSpace: 'nowrap' }}>
              {joining ? '...' : 'Join →'}
            </button>
          </div>

          {/* Room hint */}
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 16, fontFamily: 'JetBrains Mono, monospace' }}>
            Rooms are private · Max 2 participants
          </p>
        </div>

        {/* Features grid */}
        <div style={{ marginBottom: 80 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 40 }}>
            Everything you need in one room
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { icon: '🎥', label: 'Video & Audio', desc: 'WebRTC peer-to-peer, always-on mic' },
              { icon: '💻', label: 'Code Editor', desc: 'Monaco with live sync & 6 languages' },
              { icon: '▶', label: 'Code Execution', desc: 'Run code instantly via Judge0' },
              { icon: '🎨', label: 'Whiteboard', desc: 'Collaborative drawing in real time' },
              { icon: '🖥', label: 'Screen Share', desc: 'One presenter at a time' },
              { icon: '🤖', label: 'AI Feedback', desc: 'Llama 3.3 code review via Groq' },
              { icon: '💬', label: 'Live Chat', desc: 'WhatsApp-style messaging' },
              { icon: '⏱', label: 'Timer', desc: 'Synced countdown for both sides' },
            ].map((f, i) => (
              <div key={i} className="card-glow p-5 rounded-2xl">
                <div className="feature-icon" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, marginBottom: 12 }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stack */}
        <div className="text-center">
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 20 }}>
            Built with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {['Next.js', 'FastAPI', 'WebRTC', 'Socket.IO', 'Monaco', 'Judge0', 'Groq'].map(t => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.04)', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono, monospace' }}>
          Built by <a href="https://github.com/nimo247" target="_blank" style={{ color: 'rgba(165,180,252,0.6)', textDecoration: 'none' }}>nimo247</a> · NSUT Delhi
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', fontFamily: 'JetBrains Mono, monospace' }}>
          ECE 2024–2028
        </span>
      </footer>

    </div>
  )
}