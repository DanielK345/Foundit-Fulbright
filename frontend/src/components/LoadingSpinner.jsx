const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
  xl: 'h-12 w-12 border-4',
}

const COLOR_CLASSES = {
  gold: 'border-brand-gold border-t-transparent',
  white: 'border-white border-t-transparent',
  navy: 'border-brand-navy border-t-transparent',
  gray: 'border-gray-400 border-t-transparent',
}

export default function LoadingSpinner({ size = 'md', color = 'gold' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full animate-spin ${SIZE_CLASSES[size]} ${COLOR_CLASSES[color]}`}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <LoadingSpinner size="xl" color="gold" />
    </div>
  )
}
