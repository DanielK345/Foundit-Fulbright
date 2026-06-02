import { useEffect, useRef } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

export default function useWebSocket({ onNotification, onMessage, enabled }) {
  const clientRef = useRef(null)

  useEffect(() => {
    if (!enabled) return

    const token = sessionStorage.getItem('token')
    if (!token) return

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (frame) => {
          try {
            const data = JSON.parse(frame.body)
            onNotification?.(data)
          } catch (_) {}
        })
        client.subscribe('/user/queue/messages', (frame) => {
          try {
            const data = JSON.parse(frame.body)
            onMessage?.(data)
          } catch (_) {}
        })
      },
      onStompError: () => {},
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
  }, [enabled])

  const sendMessage = (destination, body) => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({ destination, body: JSON.stringify(body) })
    }
  }

  return { clientRef, sendMessage }
}
