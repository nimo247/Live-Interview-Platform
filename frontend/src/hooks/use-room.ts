'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type SimplePeer from 'simple-peer'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { RoomMedia, type MediaState } from '@/lib/room-media'
import { LANGUAGES } from '@/lib/rooms'

export interface ChatMessage {
  sender: string
  text: string
  time: string
  self: boolean
}

const emptyMedia: MediaState = {
  local: null, remote: null, screen: null, remoteScreen: null,
  cameraOn: false, microphoneOn: false, remoteCameraOn: false, busy: false,
}

export function useRoom(roomId: string, username: string) {
  const [code, setCode] = useState('// Start coding here\n')
  const codeRef = useRef(code)
  const [language, setLanguage] = useState('javascript')
  const [connected, setConnected] = useState(false)
  const [participants, setParticipants] = useState(0)
  const [partnerName, setPartnerName] = useState('Interview partner')
  const [notice, setNotice] = useState('')
  const [roomError, setRoomError] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [media, setMedia] = useState<MediaState>(emptyMedia)
  const mediaRef = useRef<RoomMedia | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const deadlineRef = useRef(0)

  const startTimer = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    deadlineRef.current = Date.now() + seconds * 1000
    setTimerSeconds(seconds)
    setTimerRunning(true)
  }, [])
  const pauseTimer = useCallback(() => {
    setTimerRunning(false)
    setTimerSeconds(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
  }, [])
  const resetTimer = useCallback(() => {
    setTimerRunning(false)
    setTimerSeconds(0)
    deadlineRef.current = 0
  }, [])

  useEffect(() => {
    if (!timerRunning) return
    const interval = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setTimerSeconds(seconds)
      if (!seconds) setTimerRunning(false)
    }, 250)
    return () => clearInterval(interval)
  }, [timerRunning])

  useEffect(() => {
    const socket = getSocket()
    let active = true
    const controller = new RoomMedia(socket, roomId,
      patch => { if (active) setMedia(previous => ({ ...previous, ...patch })) },
      message => { if (active) setNotice(message) })
    mediaRef.current = controller
    const onConnect = () => {
      setRoomError('')
      socket.emit('join_room', { room_id: roomId, username })
    }
    const onDisconnect = () => {
      setConnected(false)
      setParticipants(0)
      controller.disconnectPeer()
    }
    const onConnectError = () => {
      setConnected(false)
      setRoomError('Connection lost. Trying to reconnect to your room…')
    }
    const onJoined = (data: { code: string; language: string; participants: number }) => {
      codeRef.current = data.code
      setCode(data.code)
      setLanguage(data.language)
      setParticipants(data.participants)
      setConnected(true)
      setRoomError('')
      if (data.participants === 2) controller.connect(false)
    }
    const onUserJoined = (data: { participants: number; username: string }) => {
      setParticipants(data.participants)
      setPartnerName(data.username)
      setNotice(data.username + ' joined the room.')
      // The existing participant offers; the arriving participant answers.
      controller.connect(true)
    }
    const onUserLeft = () => {
      setParticipants(1)
      setPartnerName('Interview partner')
      setNotice('Your partner left the room.')
      controller.disconnectPeer()
    }
    const onFull = (data: { message: string }) => {
      setRoomError(data.message || 'This room already has two participants.')
      socket.disconnect()
    }
    const onCode = (data: { code: string }) => {
      codeRef.current = data.code
      setCode(data.code)
    }
    const onLanguage = (data: { language: string }) => setLanguage(data.language)
    const onChat = (data: { sender: string; text: string }) => {
      setChatMessages(previous => [...previous, {
        sender: data.sender, text: data.text, self: false,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
    }
    const onSignal = (data: { sdp: SimplePeer.SignalData }) => controller.signal(data.sdp)
    const onScreenSignal = (data: { sdp: SimplePeer.SignalData }) => controller.screenSignal(data.sdp)
    const onVideoStopped = () => controller.setRemoteCamera(false)
    const onVideoReady = () => controller.setRemoteCamera(true)
    const onScreenStopped = () => controller.stopScreen()
    const onTimerStart = (data: { seconds: number }) => startTimer(data.seconds)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room_joined', onJoined)
    socket.on('user_joined', onUserJoined)
    socket.on('user_left', onUserLeft)
    socket.on('room_full', onFull)
    socket.on('code_updated', onCode)
    socket.on('language_updated', onLanguage)
    socket.on('chat_message', onChat)
    socket.on('webrtc_offer', onSignal)
    socket.on('webrtc_answer', onSignal)
    socket.on('screen_offer', onScreenSignal)
    socket.on('screen_answer', onScreenSignal)
    socket.on('remote_video_stopped', onVideoStopped)
    socket.on('peer_ready', onVideoReady)
    socket.on('screen_stopped', onScreenStopped)
    socket.on('timer_start', onTimerStart)
    socket.on('timer_resume', onTimerStart)
    socket.on('timer_stop', pauseTimer)
    socket.on('timer_reset', resetTimer)
    if (socket.connected) onConnect()
    else socket.connect()

    return () => {
      active = false
      controller.dispose()
      mediaRef.current = null
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room_joined', onJoined)
      socket.off('user_joined', onUserJoined)
      socket.off('user_left', onUserLeft)
      socket.off('room_full', onFull)
      socket.off('code_updated', onCode)
      socket.off('language_updated', onLanguage)
      socket.off('chat_message', onChat)
      socket.off('webrtc_offer', onSignal)
      socket.off('webrtc_answer', onSignal)
      socket.off('screen_offer', onScreenSignal)
      socket.off('screen_answer', onScreenSignal)
      socket.off('remote_video_stopped', onVideoStopped)
      socket.off('peer_ready', onVideoReady)
      socket.off('screen_stopped', onScreenStopped)
      socket.off('timer_start', onTimerStart)
      socket.off('timer_resume', onTimerStart)
      socket.off('timer_stop', pauseTimer)
      socket.off('timer_reset', resetTimer)
      disconnectSocket()
    }
  }, [roomId, username, startTimer, pauseTimer, resetTimer])

  function changeCode(value: string | undefined) {
    const next = value ?? ''
    if (!connected || next === codeRef.current) return
    codeRef.current = next
    setCode(next)
    getSocket().emit('code_change', { room_id: roomId, code: next })
  }

  function changeLanguage(value: string) {
    if (!connected || !LANGUAGES.some(item => item.value === value)) return
    setLanguage(value)
    getSocket().emit('language_change', { room_id: roomId, language: value })
  }

  function sendMessage(value: string) {
    const text = value.trim()
    if (!connected || !text) return false
    getSocket().emit('chat_message', { room_id: roomId, sender: username, text })
    setChatMessages(previous => [...previous, {
      sender: username, text, self: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
    return true
  }

  function toggleTimer(minutes: number) {
    if (!connected) return
    if (timerRunning) {
      pauseTimer()
      getSocket().emit('timer_stop', { room_id: roomId })
    } else {
      const seconds = timerSeconds || Math.floor(minutes * 60)
      if (!Number.isFinite(seconds) || seconds <= 0) return
      startTimer(seconds)
      getSocket().emit('timer_start', { room_id: roomId, seconds })
    }
  }

  function clearTimer() {
    if (!connected) return
    resetTimer()
    getSocket().emit('timer_reset', { room_id: roomId })
  }

  function leave() {
    mediaRef.current?.dispose()
    disconnectSocket()
  }

  return {
    code, language, connected, participants, partnerName, notice, setNotice, roomError,
    chatMessages, changeCode, changeLanguage, sendMessage, timerSeconds, timerRunning,
    toggleTimer, clearTimer, media, mediaRef, leave,
  }
}
