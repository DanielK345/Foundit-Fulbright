import { useBackendStatus } from '../hooks/useBackendStatus'

const CONFIG = {
  checking: { dot: 'bg-yellow-400 animate-pulse', text: 'Connecting to server…', label: 'text-yellow-600' },
  online:   { dot: 'bg-green-400',               text: 'Server online',          label: 'text-green-600' },
  offline:  { dot: 'bg-red-500',                 text: 'Server offline',          label: 'text-red-600'  },
}

/**
 * A small pill that shows backend connectivity status.
 * Pass `className` to adjust positioning/margin from the parent.
 */
export default function BackendStatusBadge({ className = '' }) {
  const status = useBackendStatus()
  const { dot, text, label } = CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 ${className}`}
      title={`Backend status: ${status}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <span className={`text-[11px] font-medium ${label}`}>{text}</span>
    </span>
  )
}
