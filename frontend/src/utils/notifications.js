function getNotificationTime(notification) {
  const timestamp = notification?.timestamp ? new Date(notification.timestamp).getTime() : 0
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getNotificationGroupKey(notification) {
  if (notification?.chatSenderId) return `chat:${notification.chatSenderId}`
  if (notification?.matchId) return `match:${notification.matchId}`
  if (notification?.lostItemId || notification?.foundItemId) {
    return `item:${notification.lostItemId ?? 'none'}:${notification.foundItemId ?? 'none'}`
  }
  return `notification:${notification?.id ?? 'unknown'}`
}

export function getLatestNotifications(notifications = []) {
  const latestByGroup = new Map()

  notifications.forEach((notification) => {
    const groupKey = getNotificationGroupKey(notification)
    const current = latestByGroup.get(groupKey)

    if (!current) {
      latestByGroup.set(groupKey, notification)
      return
    }

    const currentTime = getNotificationTime(current)
    const nextTime = getNotificationTime(notification)

    if (nextTime > currentTime || (nextTime === currentTime && (notification.id ?? 0) > (current.id ?? 0))) {
      latestByGroup.set(groupKey, notification)
    }
  })

  return Array.from(latestByGroup.values()).sort((a, b) => {
    const timeDiff = getNotificationTime(b) - getNotificationTime(a)
    if (timeDiff !== 0) return timeDiff
    return (b.id ?? 0) - (a.id ?? 0)
  })
}
