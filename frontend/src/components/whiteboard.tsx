'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { getSocket } from '@/lib/socket'
import { Icon } from './icon'

interface Stroke {
  room_id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  size: number
  clear?: boolean
}

const WIDTH = 1600
const HEIGHT = 1000

export function Whiteboard({ roomId, connected }: { roomId: string; connected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState('#35348f')
  const [size, setSize] = useState(3)

  function draw(stroke: Stroke) {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    if (stroke.clear) { context.clearRect(0, 0, WIDTH, HEIGHT); return }
    context.beginPath()
    context.moveTo(stroke.x1, stroke.y1)
    context.lineTo(stroke.x2, stroke.y2)
    context.strokeStyle = stroke.color
    context.lineWidth = stroke.size
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
  }

  useEffect(() => {
    const socket = getSocket()
    socket.on('whiteboard_updated', draw)
    return () => { socket.off('whiteboard_updated', draw) }
  }, [roomId])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * WIDTH / bounds.width, y: (event.clientY - bounds.top) * HEIGHT / bounds.height }
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (!connected || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointRef.current = point(event)
    move(event)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!connected || !pointRef.current) return
    const next = point(event)
    const stroke = { room_id: roomId, x1: pointRef.current.x, y1: pointRef.current.y, x2: next.x, y2: next.y, color, size }
    draw(stroke)
    getSocket().emit('whiteboard_draw', stroke)
    pointRef.current = next
  }

  function clear() {
    const stroke = { room_id: roomId, x1: 0, y1: 0, x2: 0, y2: 0, color, size, clear: true }
    draw(stroke)
    getSocket().emit('whiteboard_draw', stroke)
  }

  return (
    <div className="board-panel">
      <div className="board-tools">
        <label>Color<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
        <label>Brush<input type="range" min={2} max={16} value={size} onChange={event => setSize(Number(event.target.value))} /></label>
        <button className="button" onClick={clear} disabled={!connected}><Icon name="trash" />Clear board</button>
      </div>
      <div className="board-stage">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Shared drawing canvas. Use a mouse, pen, or touch to sketch."
          onPointerDown={start} onPointerMove={move} onPointerUp={() => { pointRef.current = null }}
          onPointerCancel={() => { pointRef.current = null }} onLostPointerCapture={() => { pointRef.current = null }}>
          Use session chat to share a text description of your diagram.
        </canvas>
      </div>
    </div>
  )
}
