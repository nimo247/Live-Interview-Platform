'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from './icon'

export function MediaVideo({ stream, muted = false, label }: { stream: MediaStream | null; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let active = true
    element.srcObject = stream
    if (stream) {
      element.play().then(() => { if (active) setBlocked(false) }).catch(() => { if (active) setBlocked(true) })
    }
    return () => { active = false; element.srcObject = null }
  }, [stream])
  return <>
    <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />
    {blocked && <button className="button playback-button" onClick={() => {
      ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
    }}><Icon name="play" />Play media</button>}
  </>
}
