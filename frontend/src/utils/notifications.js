/**
 * De-duplicates notifications: for each semantic group (chat thread, match, item pair),
 * only keep the most recent notification.
 */
export function getLatestNotifications(notifications) {
  const groups = new Map()

  for (const n of notifications) {
    let key

    if (n.chatSenderId) {
      key = `chat:${n.chatSenderId}`
    } else if (n.matchId) {
      key = `match:${n.matchId}`
    } else if (n.lostItemId && n.foundItemId) {
      key = `item:${n.lostItemId}:${n.foundItemId}`
    } else {
      key = `notification:${n.id}`
    }

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, n)
    } else {
      const existingTime = new Date(existing.timestamp).getTime()
      const newTime = new Date(n.timestamp).getTime()
      if (newTime > existingTime || (newTime === existingTime && n.id > existing.id)) {
        groups.set(key, n)
      }
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  )
}

export function timeAgo(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
