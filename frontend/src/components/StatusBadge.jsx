export default function StatusBadge({ status }) {
  const config = {
    FOUND: { label: 'FOUND', className: 'bg-blue-100 text-blue-700 border border-blue-200' },
    LOST: { label: 'LOST', className: 'bg-red-100 text-red-700 border border-red-200' },
    CLAIMED: { label: 'CLAIMED', className: 'bg-green-100 text-green-700 border border-green-200' },
  }

  const badge = config[status?.toUpperCase()] || {
    label: status || 'UNKNOWN',
    className: 'bg-gray-100 text-gray-700 border border-gray-200'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${badge.className}`}>
      {badge.label}
    </span>
  )
}
