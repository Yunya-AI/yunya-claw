import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Pin, X, Sparkles, Image } from 'lucide-react'

interface ClipboardRecord {
  id: string
  text: string
  timestamp: number
  screenshotFile?: string
  analysis?: string
  pinned?: boolean
  tags?: string[]
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${time}`
}

export default function QuickPastePage() {
  const [records, setRecords] = useState<ClipboardRecord[]>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPastingRef = useRef(false)

  const api = window.electronAPI?.clipboard

  const loadRecords = useCallback(async () => {
    if (!api) return
    try {
      const res = await api.getRecords(query || undefined)
      if (res.success) {
        setRecords(res.records)
        setSelectedIndex(0)
        setScreenshotUrl(null)
      }
    } catch (err) {
      console.error('加载记录失败:', err)
    }
  }, [api, query])

  // 重置状态并加载数据
  const resetAndLoad = useCallback(() => {
    isPastingRef.current = false
    setLoadingScreenshot(false)
    loadRecords()
    inputRef.current?.focus()
  }, [loadRecords])

  // 页面加载时初始化
  useEffect(() => {
    resetAndLoad()
  }, [resetAndLoad])

  // 监听窗口显示事件
  useEffect(() => {
    if (!api?.onShow) return
    const unsubscribe = api.onShow(() => {
      resetAndLoad()
    })
    return unsubscribe
  }, [api, resetAndLoad])

  useEffect(() => {
    loadRecords()
    inputRef.current?.focus()
  }, [loadRecords])

  // 加载截图
  const loadScreenshot = useCallback(async (fileName: string) => {
    if (!api || isPastingRef.current) return
    setLoadingScreenshot(true)
    try {
      const res = await api.getScreenshot(fileName)
      if (!isPastingRef.current) {
        if (res.success && res.dataUrl) {
          setScreenshotUrl(res.dataUrl)
        }
      }
    } catch (err) {
      console.error('加载截图失败:', err)
    } finally {
      if (!isPastingRef.current) {
        setLoadingScreenshot(false)
      }
    }
  }, [api])

  // 当选中项变化时加载截图
  useEffect(() => {
    // 清除之前的定时器
    if (screenshotTimeoutRef.current) {
      clearTimeout(screenshotTimeoutRef.current)
    }

    const record = records[selectedIndex]
    if (record?.screenshotFile) {
      // 延迟加载截图，避免快速滚动时频繁请求
      screenshotTimeoutRef.current = setTimeout(() => {
        if (!isPastingRef.current) {
          loadScreenshot(record.screenshotFile!)
        }
      }, 200)
    } else {
      setScreenshotUrl(null)
    }

    return () => {
      if (screenshotTimeoutRef.current) {
        clearTimeout(screenshotTimeoutRef.current)
      }
    }
  }, [selectedIndex, records, loadScreenshot])

  const handlePaste = async (text: string) => {
    if (!api || isPastingRef.current) return
    isPastingRef.current = true // 标记正在粘贴，防止重复操作
    try {
      await api.paste(text)
    } catch (err) {
      console.error('粘贴失败:', err)
      isPastingRef.current = false // 失败时重置
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, records.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (records[selectedIndex]) {
        handlePaste(records[selectedIndex].text)
      }
    } else if (e.key === 'Escape') {
      window.close()
    }
  }

  // 确保选中项可见
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const selectedRecord = records[selectedIndex]

  return (
    <div
      className="flex flex-col h-screen bg-[#1a1a1a] text-foreground select-none"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onKeyDown={handleKeyDown}
    >
      {/* 拖拽区域 + 搜索 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索剪贴板..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground w-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
        {query && (
          <button onClick={() => setQuery('')} className="cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* 主内容区：列表 + 截图预览 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 列表 */}
        <div ref={listRef} className="w-72 overflow-y-auto px-1.5 py-1.5 shrink-0">
          {records.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              暂无记录
            </div>
          ) : (
            records.map((record, idx) => (
              <div
                key={record.id}
                className={`px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                  idx === selectedIndex
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-white/5 text-foreground/80'
                }`}
                onClick={() => handlePaste(record.text)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="flex items-start gap-2">
                  {record.pinned && <Pin className="w-3 h-3 text-primary mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate leading-snug">{record.text.split('\n')[0]}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatTime(record.timestamp)}</span>
                      {record.screenshotFile && <Image className="w-3 h-3 text-muted-foreground" />}
                      {record.analysis && <Sparkles className="w-3 h-3 text-primary/50" />}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 截图预览 - 加大宽度 */}
        <div className="flex-1 border-l border-border flex flex-col bg-black/20 min-w-0">
          {screenshotUrl ? (
            <div className="flex flex-col h-full">
              <div className="text-xs text-muted-foreground px-3 py-1.5 border-b border-border flex items-center gap-1">
                <Image className="w-3 h-3" />
                屏幕截图
              </div>
              <div className="flex-1 overflow-auto p-3 flex items-start justify-center">
                <img
                  src={screenshotUrl}
                  alt="截图"
                  className="max-w-full max-h-full rounded border border-border/50 shadow-lg"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
            </div>
          ) : loadingScreenshot ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              加载中...
            </div>
          ) : selectedRecord?.screenshotFile ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              加载中...
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 text-xs gap-1">
              <Image className="w-8 h-8" />
              <span>无截图</span>
            </div>
          )}
        </div>
      </div>

      {/* 底栏提示 */}
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground flex items-center gap-3">
        <span>Enter 粘贴</span>
        <span>Esc 关闭</span>
        <div className="flex-1" />
        <span>{records.length} 条</span>
      </div>
    </div>
  )
}
