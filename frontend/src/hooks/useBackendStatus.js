import { useEffect, useState } from 'react'

const PING_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/items'
const INTERVAL_MS = 30_000

/**
 * Returns the current backend connectivity status:
 *   'checking' | 'online' | 'offline'
 *
 * Any HTTP response (even 4xx/5xx) means the server is reachable → 'online'.
 * Only a network-level failure (no response / timeout) → 'offline'.
 */
export function useBackendStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        await fetch(PING_URL, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
        // Any response means the backend is up
        if (!cancelled) setStatus('online')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }

    ping()
    const id = setInterval(ping, INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return status
}
