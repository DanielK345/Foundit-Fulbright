import { useEffect, useState } from 'react'

// Use GET (not HEAD) — HEAD is not in the backend's CORS allowedMethods list,
// which causes cross-origin HEAD requests to be rejected by the CORS filter even
// though the server is running. GET /api/items is explicitly permitted.
const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const PING_URL = BASE + '/api/items'
const INTERVAL_MS = 30_000

/**
 * Returns the current backend connectivity status:
 *   'checking' | 'online' | 'offline'
 *
 * Any HTTP response (even 4xx/5xx) means the server is reachable → 'online'.
 * Only a network-level failure (no response / timeout / CORS error) → 'offline'.
 */
export function useBackendStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        // GET instead of HEAD — avoids CORS rejection for non-listed methods
        await fetch(PING_URL, { method: 'GET', signal: AbortSignal.timeout(30000) })
        // Any response (200, 403, 503…) means the network path is open
        if (!cancelled) setStatus('online')
      } catch (err) {
        console.warn('[BackendStatus] ping failed →', err?.name, err?.message, '| URL:', PING_URL)
        if (!cancelled) setStatus('offline')
      }
    }

    ping()
    const id = setInterval(ping, INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return status
}
