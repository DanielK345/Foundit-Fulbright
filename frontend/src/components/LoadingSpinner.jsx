export default function LoadingSpinner({ size = 'md', color = 'gold' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4',
    xl: 'w-16 h-16 border-4'
  }

  const colorClasses = {
    gold: 'border-brand-gold border-t-transparent',
    white: 'border-white border-t-transparent',
    navy: 'border-brand-navy border-t-transparent',
    gray: 'border-gray-400 border-t-transparent'
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeClasses[size] || sizeClasses.md} ${colorClasses[color] || colorClasses.gold} rounded-full animate-spin`}
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="xl" color="gold" />
        <p className="mt-4 text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  )
}
