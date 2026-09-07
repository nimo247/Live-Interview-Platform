'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icon'
import { createRoom, normalizeRoomCode } from '@/lib/rooms'

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [username, setUsername] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    const name = username.trim()
    if (!name) { setError('Enter your name to continue.'); return }
    const code = normalizeRoomCode(roomCode)
    if (mode === 'join' && !code) { setError('Enter the 8-character room code shared with you.'); return }
    setError('')
    setLoading(true)
    try {
      const roomId = mode === 'create' ? await createRoom() : code
      router.push('/room/' + roomId + '?username=' + encodeURIComponent(name))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the room. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="home-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="home-header">
        <a href="/" className="brand"><span className="brand-mark"><Icon name="code" /></span>Live Interview</a>
        <span className="header-note">A shared space to think and code.</span>
      </header>

      <main id="main-content" className="home-main">
        <div className="home-heading">
          <p className="eyebrow">THE INTERVIEW WORKSPACE</p>
          <h1>Good conversations.<br /><span>Better problem solving.</span></h1>
          <p>Start a one-to-one session with code, video, and a whiteboard in one place.</p>
        </div>

        <div className="lobby-grid">
          <section className="lobby-card" aria-labelledby="room-form-heading">
            <div className="segmented-control" aria-label="Choose how to enter a room">
              {(['create', 'join'] as const).map(value => (
                <button key={value} type="button" aria-pressed={mode === value} disabled={loading}
                  onClick={() => { setMode(value); setError('') }}>
                  <Icon name={value === 'create' ? 'plus' : 'link'} />
                  {value === 'create' ? 'Create a room' : 'Join a room'}
                </button>
              ))}
            </div>
            <div className="form-heading">
              <h2 id="room-form-heading">{mode === 'create' ? 'Set up your session' : 'Meet your interview partner'}</h2>
              <p>{mode === 'create' ? 'Create a room, then share its code with your partner.' : 'Use the room code your partner shared with you.'}</p>
            </div>
            <form onSubmit={handleSubmit} className="room-form" aria-busy={loading}>
              <div className="field">
                <label htmlFor="username">Your name</label>
                <input id="username" name="username" autoComplete="name" placeholder="e.g. Naman" value={username}
                  onChange={event => { setUsername(event.target.value); setError('') }} maxLength={60} required disabled={loading} />
              </div>
              {mode === 'join' && (
                <div className="field">
                  <label htmlFor="room-code">Room code</label>
                  <input id="room-code" name="room-code" className="room-code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                    placeholder="e.g. A1B2C3D4" value={roomCode} maxLength={8} required disabled={loading}
                    aria-describedby="room-code-hint" onChange={event => { setRoomCode(event.target.value.toUpperCase()); setError('') }} />
                  <p id="room-code-hint" className="field-hint">8 letters and numbers. No spaces.</p>
                </div>
              )}
              {error && <p className="alert alert-error" role="alert"><Icon name="alert" />{error}</p>}
              <button className="button button-primary button-wide" type="submit" disabled={loading}>
                <Icon name={loading ? 'loader' : 'arrow'} className={loading ? 'spin' : ''} />
                {loading ? 'Opening your room…' : mode === 'create' ? 'Create interview room' : 'Join interview room'}
              </button>
              <p className="form-note"><Icon name="users" />Two people per room. No account needed.</p>
            </form>
          </section>

          <aside className="workspace-guide" aria-labelledby="workspace-heading">
            <div className="guide-heading"><span className="eyebrow">ONE ROOM. SHARED FOCUS.</span><Icon name="code" /></div>
            <h2 id="workspace-heading">Everything you need,<br />within reach.</h2>
            <ul className="feature-list">
              <li><span className="feature-icon"><Icon name="code" /></span><div><h3>Code together</h3><p>A synchronized editor with six languages and code execution.</p></div></li>
              <li><span className="feature-icon"><Icon name="video" /></span><div><h3>Stay in the conversation</h3><p>Video, audio, screen sharing, and session chat.</p></div></li>
              <li><span className="feature-icon"><Icon name="pen" /></span><div><h3>Make your thinking visible</h3><p>Sketch ideas on the whiteboard and request AI code feedback.</p></div></li>
            </ul>
            <p className="guide-note">You control when your microphone and camera turn on.</p>
          </aside>
        </div>
      </main>
      <footer className="home-footer"><span>Live Interview</span><span>Built for one conversation at a time.</span></footer>
    </div>
  )
}
