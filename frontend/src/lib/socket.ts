import { io, Socket } from 'socket.io-client'
import { BACKEND_URL } from './rooms'

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ['websocket'],
      autoConnect: false,
    })
  }
  return socket
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
