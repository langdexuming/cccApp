export function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatMetricValue(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  if (Math.abs(value) < 1 && value !== 0) {
    return value.toFixed(4)
  }

  if (Number.isInteger(value)) {
    return String(value)
  }

  return value.toFixed(4)
}

export function formatDuration(startedAt, finishedAt, fallbackStatus = '') {
  if (!startedAt) {
    return '-'
  }

  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return fallbackStatus === 'running' ? '运行中' : '-'
  }

  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时 ${minutes}分 ${seconds}秒`
  }
  return `${minutes}分 ${seconds}秒`
}

export function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}
