import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getItems } from '../api/items'
import ItemCard from '../components/ItemCard'
import LoadingSpinner from '../components/LoadingSpinner'

const TYPE_FILTERS = [
  { label: 'All Items', value: '' },
  { label: 'Lost Items', value: 'LOST' },
  { label: 'Found Items', value: 'FOUND' },
]

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await getItems({})
      setAllItems(res.data || [])
    } catch {
      setError('Failed to load items.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const displayedItems = allItems.filter(item => {
    const q = searchInput.trim().toLowerCase()
    const matchSearch = !q ||
      item.name?.toLowerCase().includes(q) ||
      item.locationFound?.toLowerCase().includes(q)
    const matchType = !typeFilter || item.itemType === typeFilter
    return matchSearch && matchType
  })

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-white">

      {/* Search + Filter bar */}
      <div className="bg-gray-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-3">

          {/* Type filter tabs */}
          <div className="flex items-center flex-shrink-0 border border-gray-200 rounded-full bg-white overflow-hidden">
            {TYPE_FILTERS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                style={typeFilter === opt.value ? { color: '#EEA40F' } : {}}
                className={`px-4 py-3 rounded-full text-sm transition-colors ${
                  typeFilter === opt.value
                    ? ''
                    : 'text-gray-500 hover:text-brand-gold'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 border border-gray-200 rounded-full px-4 py-3 bg-white ml-auto" style={{ width: '720px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for items"
              className="text-sm outline-none text-gray-500 placeholder-gray-500 w-full bg-transparent"
            />
          </div>

        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-6 py-3 bg-gray-50">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 font-medium">{error}</div>
        ) : displayedItems.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-base font-medium">No items found.</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {displayedItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

    </div>
  )
}
