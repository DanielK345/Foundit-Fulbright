const STATUS_STYLES = {
  FOUND: 'bg-blue-100 text-blue-700',
  LOST: 'bg-red-100 text-red-700',
  CLAIMED: 'bg-green-100 text-green-700',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}
