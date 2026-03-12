import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/** 将 avatar 转为 media.readFile 可读的 URL：workspace 相对路径 -> workspace:agentId:path */
export function toMediaReadableUrl(avatar: string | undefined, agentId: string): string | undefined {
  if (!avatar?.trim()) return undefined
  const v = avatar.trim()
  if (v.startsWith('media://') || v.startsWith('file://') || v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:')) return v
  return `workspace:${agentId}:${v}`
}

/** 数字人头像：有 avatar 时加载并显示，否则显示 emoji 或默认图标 */
export function AgentAvatar({
  avatar,
  agentId,
  emoji,
  isMain,
  iconDataUrl,
  className,
}: { avatar?: string; agentId?: string; emoji?: string; isMain?: boolean; iconDataUrl?: string | null; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const readUrl = avatar && agentId ? toMediaReadableUrl(avatar, agentId) : avatar
  useEffect(() => {
    if (!readUrl) {
      setDataUrl(null)
      return
    }
    if (readUrl.startsWith('http') || readUrl.startsWith('data:')) {
      setDataUrl(readUrl)
      return
    }
    let cancelled = false
    window.electronAPI?.media?.readFile(readUrl).then(res => {
      if (!cancelled && res.success && res.dataUrl) setDataUrl(res.dataUrl)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [readUrl])
  if (isMain && !avatar) {
    return <img src={iconDataUrl || `${import.meta.env.BASE_URL}icon.png`} alt="" className={cn('w-full h-full object-cover', className)} />
  }
  if (avatar && dataUrl) {
    return <img src={dataUrl} alt="" className={cn('w-full h-full object-cover', className)} />
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-full h-full text-lg leading-none select-none',
        className
      )}
    >
      {emoji || '🤖'}
    </span>
  )
}
