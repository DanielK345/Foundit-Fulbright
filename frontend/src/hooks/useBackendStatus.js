import { useEffect, useState } from 'react'

const PING_URL = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/items'
const INTERVAL_MS = 30_000

/**
 * Returns the current backend connectivity status:
 *   'checking' | 'online' | 'offline'
 */
export function useBackendStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        const res = await fetch(PING_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline')
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
