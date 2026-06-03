import { useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

export function useWebSocket({ onNotification, onMessage, enabled }) {
  const clientRef = useRef(null)
  const token = sessionStorage.getItem('token')

  const onNotificationRef = useRef(onNotification)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled || !token) return

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (frame) => {
          try {
            const data = JSON.parse(frame.body)
            onNotificationRef.current && onNotificationRef.current(data)
          } catch (e) {
            console.error('Error parsing notification:', e)
          }
        })
        client.subscribe('/user/queue/messages', (frame) => {
          try {
            const data = JSON.parse(frame.body)
            onMessageRef.current && onMessageRef.current(data)
          } catch (e) {
            console.error('Error parsing message:', e)
          }
        })
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame)
      },
      reconnectDelay: 5000,
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
  }, [enabled, token])

  const sendMessage = useCallback((destination, body) => {
    if (clientRef.current && clientRef.current.connected) {
      clientRef.current.publish({
        destination,
        body: JSON.stringify(body)
      })
    }
  }, [])

  return { clientRef, sendMessage }
}
