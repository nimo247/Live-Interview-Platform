'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
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
    router.push(`/room/${joinCode.trim().toUpperCase()}?username=${encodeURIComponent(username)}`)
  }

  return (
    <div className="light bg-surface text-on-surface font-montserrat selection:bg-primary-container selection:text-on-primary-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        * { box-sizing: border-box; }

        :root {
          --primary: #5352a5;
          --secondary: #006947;
          --tertiary: #4647d3;
          --surface: #f3f7fb;
          --surface-container-low: #ecf1f6;
          --surface-container-lowest: #ffffff;
          --surface-container-high: #dde3e8;
          --surface-container-highest: #d7dee3;
          --on-surface: #2a2f32;
          --on-surface-variant: #575c60;
          --primary-container: #a19ff9;
          --secondary-container: #69f6b8;
          --on-primary-container: #201c71;
          --on-secondary-container: #005a3c;
          --error-container: #f74b6d;
          --on-error-container: #510017;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
        }

        .tonal-depth {
          box-shadow: 0 24px 48px -12px rgba(49, 46, 129, 0.06);
        }

        .emerald-pulse {
          box-shadow: 0 0 0 0 rgba(0, 105, 71, 0.4);
          animation: pulse-anim 2s infinite;
        }

        @keyframes pulse-anim {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 105, 71, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 105, 71, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 105, 71, 0); }
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          vertical-align: middle;
        }
      `}</style>

      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-slate-50/80 backdrop-blur-xl shadow-sm border-b border-slate-200/50">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold text-indigo-900 tracking-tight">TechCode Pro</span>
          <nav className="hidden md:flex items-center gap-6">
            <a className="text-indigo-700 font-bold border-b-2 border-indigo-600 px-1 py-4 tracking-tight" href="#">Home</a>
            <a className="text-slate-500 font-medium hover:text-indigo-600 transition-colors tracking-tight" href="#">Timer: 45:00</a>
            <a className="text-slate-500 font-medium hover:text-indigo-600 transition-colors tracking-tight" href="#">Room: #XC-921</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:text-indigo-600 transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button className="p-2 text-slate-500 hover:text-indigo-600 transition-colors">
            <span className="material-symbols-outlined">help</span>
          </button>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-indigo-200 bg-slate-200" />
        </div>
      </header>

      {/* SideNavBar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] z-40 flex flex-col w-20 md:w-64 bg-slate-100 border-r border-slate-200/30 transition-all duration-300 ease-in-out hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined">terminal</span>
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-900">Project Alpha</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">V8 Engine Dev</p>
            </div>
          </div>
          <nav className="space-y-2">
            <a className="flex items-center gap-3 px-4 py-3 bg-white text-indigo-600 border-l-4 border-indigo-600 text-sm font-medium transition-all rounded-r" href="#">
              <span className="material-symbols-outlined">code</span>
              <span>Code Editor</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-indigo-500 hover:bg-slate-200/50 text-sm font-medium transition-all rounded" href="#">
              <span className="material-symbols-outlined">draw</span>
              <span>Whiteboard</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-indigo-500 hover:bg-slate-200/50 text-sm font-medium transition-all rounded" href="#">
              <span className="material-symbols-outlined">terminal</span>
              <span>Terminal</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-indigo-500 hover:bg-slate-200/50 text-sm font-medium transition-all rounded" href="#">
              <span className="material-symbols-outlined">folder_open</span>
              <span>Files</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-indigo-500 hover:bg-slate-200/50 text-sm font-medium transition-all rounded" href="#">
              <span className="material-symbols-outlined">description</span>
              <span>Notes</span>
            </a>
          </nav>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main className="md:ml-64 pt-24 pb-32 px-6 md:px-12">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Hero Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-8 space-y-8">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary-container/30 border border-secondary/20 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-secondary emerald-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-secondary-container">System Status: Optimal</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-extrabold text-indigo-950 leading-[1.1] tracking-tighter">
                  Elevate Your <span className="text-primary italic">Technical</span> Assessment
                </h1>
                <p className="text-lg text-on-surface-variant max-w-xl leading-relaxed">
                  Precision-engineered environment for real-time pair programming, architecture design, and deep technical evaluation.
                </p>
                <div className="flex flex-wrap gap-4 pt-4">
                  <button onClick={createRoom} disabled={loading} className="px-8 py-4 bg-primary text-white rounded-xl font-bold shadow-xl shadow-primary/20 hover:bg-indigo-700 hover:scale-[1.02] transition-all" style={{ opacity: loading ? 0.7 : 1 }}>
                    {loading ? '⏳ Creating...' : 'Start New Interview'}
                  </button>
                  <button className="px-8 py-4 bg-white border-2 border-primary/20 text-primary rounded-xl font-bold hover:bg-surface-container-low hover:border-primary transition-all">
                    View Schedule
                  </button>
                </div>
              </div>

              {/* Join Room Widget */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm max-w-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Join Existing Room</h3>
                  <span className="material-symbols-outlined text-indigo-400 text-sm">sensors</span>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Enter session code (e.g. XC-921)"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && joinRoom()}
                    className="flex-1 bg-surface-container-low border border-slate-200 rounded-xl text-sm px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  />
                  <button onClick={joinRoom} className="bg-indigo-600 text-white px-5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/10">
                    <span className="material-symbols-outlined text-sm font-bold">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Visual Column */}
            <div className="lg:col-span-4 relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-secondary/5 blur-3xl rounded-full"></div>
              <div className="relative space-y-6">
                <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-white/50 shadow-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Live Preview</span>
                  </div>
                  <div className="h-32 bg-slate-100/50 rounded-lg flex items-center justify-center border border-dashed border-slate-300">
                    <span className="material-symbols-outlined text-3xl text-slate-300">videocam</span>
                  </div>
                </div>
                <div className="bg-indigo-900 p-6 rounded-2xl shadow-xl shadow-indigo-900/20">
                  <p className="text-[10px] font-bold text-indigo-300/80 uppercase mb-3">Next Scheduled</p>
                  <p className="text-white font-bold">Frontend Tech Lead</p>
                  <p className="text-indigo-300 text-xs mt-1">14:00 PM - Today</p>
                </div>
              </div>
            </div>
          </section>

          {/* Status Metrics: Bento Style */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-48 group hover:border-secondary/20 transition-all">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Global Latency</p>
                <h3 className="text-4xl font-extrabold text-slate-900">12<span className="text-secondary">ms</span></h3>
              </div>
              <div className="flex items-center gap-2 text-secondary text-sm font-bold">
                <span className="material-symbols-outlined text-sm">trending_down</span>
                <span>-4ms since last session</span>
              </div>
            </div>

            <div className="bg-indigo-900 p-8 rounded-2xl shadow-xl shadow-indigo-900/10 flex flex-col justify-between h-48">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300/60 mb-2">Uptime Reliability</p>
                <h3 className="text-4xl font-extrabold text-white">99.99<span className="text-secondary-fixed">%</span></h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full border-2 border-indigo-900 bg-secondary"></div>
                  <div className="w-6 h-6 rounded-full border-2 border-indigo-900 bg-secondary"></div>
                  <div className="w-6 h-6 rounded-full border-2 border-indigo-900 bg-secondary"></div>
                  <div className="w-6 h-6 rounded-full border-2 border-indigo-900 bg-secondary"></div>
                </div>
                <span className="text-[10px] font-bold text-indigo-200">Across 14 Nodes</span>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-48 group hover:border-primary/20 transition-all">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Active Sessions</p>
                <h3 className="text-4xl font-extrabold text-slate-900">1,204</h3>
              </div>
              <div className="flex items-center justify-between">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mr-4">
                  <div className="h-full bg-primary w-[65%] rounded-full"></div>
                </div>
                <span className="text-xs font-bold text-slate-600 whitespace-nowrap">65% Capacity</span>
              </div>
            </div>
          </section>

          {/* Recent Evaluations */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-indigo-950">Recent Evaluations</h2>
              <button className="text-primary font-bold text-sm flex items-center gap-2 hover:underline">
                View All <span className="material-symbols-outlined text-sm">open_in_new</span>
              </button>
            </div>
            <div className="bg-surface-container-low rounded-3xl p-4 md:p-8">
              <div className="space-y-4">
                {/* List Item 1 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-6 hover:shadow-md transition-shadow border border-white">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-indigo-600 font-bold">JD</div>
                    <div>
                      <h4 className="font-bold text-slate-900">Jane Doe</h4>
                      <p className="text-sm text-slate-500">Senior React Engineer Role</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-secondary-container/20 text-on-secondary-container text-[10px] font-bold rounded-lg border border-secondary/10 uppercase">Passed</span>
                    <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant text-[10px] font-bold rounded-lg uppercase">#XC-921</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Score</p>
                      <p className="text-lg font-extrabold text-indigo-600">92/100</p>
                    </div>
                    <button className="p-2 text-slate-400 hover:text-indigo-600">
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                  </div>
                </div>

                {/* List Item 2 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-6 hover:shadow-md transition-shadow border border-white">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-indigo-600 font-bold">MS</div>
                    <div>
                      <h4 className="font-bold text-slate-900">Mike Smith</h4>
                      <p className="text-sm text-slate-500">Fullstack Developer</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-primary-container/20 text-on-primary-container text-[10px] font-bold rounded-lg border border-primary/10 uppercase">Reviewing</span>
                    <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant text-[10px] font-bold rounded-lg uppercase">#XC-884</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Score</p>
                      <p className="text-lg font-extrabold text-slate-400">--</p>
                    </div>
                    <button className="p-2 text-slate-400 hover:text-indigo-600">
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
