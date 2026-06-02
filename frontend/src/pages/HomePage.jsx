import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { getItems } from '../api/items'
import ItemCard from '../components/ItemCard'
import LoadingSpinner from '../components/LoadingSpinner'

const CATEGORIES = ['All', 'Electronics', 'Clothing', 'Accessories', 'Books', 'Stationery', 'Keys', 'Bag', 'ID/Card', 'Other']
const TYPES = ['All', 'LOST', 'FOUND']

export default function HomePage() {
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [type, setType] = useState('All')

  useEffect(() => {
    getItems({})
      .then(res => setAllItems(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = allItems.filter(item => {
    if (item.status === 'CLAIMED') return false
    if (type !== 'All' && item.itemType !== type) return false
    if (category !== 'All' && item.category?.toLowerCase() !== category.toLowerCase()) return false
    if (search) {
      const q = search.toLowerCase()
      return item.name?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
    }
    return true
  })

  const handleDeleted = (id) => setAllItems(prev => prev.filter(i => i.id !== id))

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Lost & Found Board</h1>
        <p className="text-sm text-gray-500">Browse recent reports from the Fulbright community</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold bg-white"
          placeholder="Search items…"
        />
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${type === t ? 'bg-brand-gold text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-gold'}`}
            style={type === t ? {} : {}}
          >
            {t === 'All' ? 'All Items' : t === 'LOST' ? 'Lost' : 'Found'}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${category === c ? 'border-transparent bg-brand-navy text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="xl" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">No items found</p>
          <p className="text-sm mt-1">Try different search terms or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(item => (
            <ItemCard key={item.id} item={item} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  )
}
