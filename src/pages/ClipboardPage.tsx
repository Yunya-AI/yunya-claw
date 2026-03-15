import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Trash2, Pin, PinOff, Copy, Image, Clock, X, Sparkles, Power, PowerOff, MoreHorizontal } from 'lucide-react'

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
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${time}`
}

function truncateText(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

export default function ClipboardPage({ active }: { active?: boolean }) {
  const [records, setRecords] = useState<ClipboardRecord[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [showScreenshot, setShowScreenshot] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const api = window.electronAPI?.clipboard

  const loadRecords = useCallback(async () => {
    if (!api) return
    const res = await api.getRecords(query || undefined)
    if (res.success) setRecords(res.records)
  }, [api, query])

  const loadStatus = useCallback(async () => {
    if (!api) return
    const res = await api.status()
    if (res.success) setEnabled(res.enabled)
  }, [api])

  useEffect(() => {
    loadRecords()
    loadStatus()
  }, [loadRecords, loadStatus])

  // 当页面激活时自动刷新
  useEffect(() => {
    if (!active) {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current)
        refreshTimer.current = null
      }
      return
    }
    loadRecords()
    refreshTimer.current = setInterval(loadRecords, 2000)
    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current)
        refreshTimer.current = null
      }
    }
  }, [active, loadRecords])

  const handleToggleMonitor = async () => {
    if (!api) return
    const res = await api.toggleMonitor(!enabled)
    if (res.success) setEnabled(res.enabled)
  }

  const handleDelete = async (id: string) => {
    if (!api) return
    await api.deleteRecord(id)
    loadRecords()
    if (selectedId === id) {
      setSelectedId(null)
      setScreenshotUrl(null)
    }
  }

  const handleClearAll = async () => {
    if (!api) return
    await api.clearAll()
    setRecords([])
    setSelectedId(null)
    setScreenshotUrl(null)
  }

  const handleTogglePin = async (id: string) => {
    if (!api) return
    await api.togglePin(id)
    loadRecords()
  }

  const handleCopy = async (text: string) => {
    if (!api) return
    try {
      await api.paste(text)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleViewScreenshot = async (fileName: string) => {
    if (!api) return
    const res = await api.getScreenshot(fileName)
    if (res.success && res.dataUrl) {
      setScreenshotUrl(res.dataUrl)
      setShowScreenshot(true)
    }
  }

  const handleAnalyze = async (id: string) => {
    if (!api) return
    setLoading(true)
    try {
      // 通过 gateway 的 chat completions 接口分析剪贴板内容
      const record = records.find(r => r.id === id)
      if (!record) return

      const gatewayStatus = await window.electronAPI.gateway.status()
      if (!gatewayStatus.running) {
        alert('Gateway 未运行，无法分析')
        return
      }

      const token = await window.electronAPI.gateway.token()
      const port = gatewayStatus.port || 18789
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: '你是一个剪贴板分析助手。请简要分析以下复制的内容，包括：1) 内容类型（代码/文本/链接/数据等）2) 关键信息摘要 3) 可能的使用场景。回答控制在100字以内。'
            },
            { role: 'user', content: record.text }
          ],
          max_tokens: 200,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const analysis = data.choices?.[0]?.message?.content || '分析失败'
        await api.updateAnalysis(id, analysis)
        loadRecords()
      }
    } catch (err) {
      console.error('分析失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedRecord = selectedId ? records.find(r => r.id === selectedId) : null
  const pinnedRecords = records.filter(r => r.pinned)
  const unpinnedRecords = records.filter(r => !r.pinned)

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <h1 className="text-base font-semibold text-foreground">剪贴板监控</h1>
        <div className="flex-1" />
        <button
          onClick={handleToggleMonitor}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            enabled
              ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
          title={enabled ? '停止监控' : '开始监控'}
        >
          {enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
          {enabled ? '监控中' : '已停止'}
        </button>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-red-500/15 hover:text-red-400 transition-colors cursor-pointer"
          title="清空所有记录"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清空
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧列表 */}
        <div className="w-80 border-r border-border flex flex-col shrink-0">
          {/* 搜索框 */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="搜索剪贴板内容..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground w-full"
              />
              {query && (
                <button onClick={() => setQuery('')} className="cursor-pointer">
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* 记录列表 */}
          <div className="flex-1 overflow-y-auto">
            {records.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                <Copy className="w-8 h-8 opacity-30" />
                <span>{enabled ? '等待剪贴板活动...' : '启用监控以开始记录'}</span>
              </div>
            ) : (
              <>
                {/* 置顶记录 */}
                {pinnedRecords.length > 0 && (
                  <div className="px-2 pt-2">
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">已置顶</div>
                    {pinnedRecords.map(record => (
                      <RecordItem
                        key={record.id}
                        record={record}
                        selected={selectedId === record.id}
                        onSelect={() => setSelectedId(record.id)}
                        onDelete={() => handleDelete(record.id)}
                        onTogglePin={() => handleTogglePin(record.id)}
                        onCopy={() => handleCopy(record.text)}
                      />
                    ))}
                  </div>
                )}
                {/* 普通记录 */}
                <div className="px-2 pt-2 pb-4">
                  {pinnedRecords.length > 0 && unpinnedRecords.length > 0 && (
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">历史记录</div>
                  )}
                  {unpinnedRecords.map(record => (
                    <RecordItem
                      key={record.id}
                      record={record}
                      selected={selectedId === record.id}
                      onSelect={() => setSelectedId(record.id)}
                      onDelete={() => handleDelete(record.id)}
                      onTogglePin={() => handleTogglePin(record.id)}
                      onCopy={() => handleCopy(record.text)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
            共 {records.length} 条记录 | Ctrl+Shift+V 快捷粘贴
          </div>
        </div>

        {/* 右侧详情 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedRecord ? (
            <div className="flex flex-col h-full">
              {/* 详情头部 */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{formatTime(selectedRecord.timestamp)}</span>
                <div className="flex-1" />
                {selectedRecord.screenshotFile && (
                  <button
                    onClick={() => handleViewScreenshot(selectedRecord.screenshotFile!)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Image className="w-3.5 h-3.5" />
                    查看截图
                  </button>
                )}
                <button
                  onClick={() => handleAnalyze(selectedRecord.id)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {loading ? 'AI 分析中...' : 'AI 分析'}
                </button>
                <button
                  onClick={() => handleCopy(selectedRecord.text)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  复制
                </button>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono bg-muted/20 rounded-lg p-4 leading-relaxed">
                  {selectedRecord.text}
                </pre>

                {selectedRecord.analysis && (
                  <div className="mt-4 bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">AI 分析</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{selectedRecord.analysis}</p>
                  </div>
                )}

                {selectedRecord.tags && selectedRecord.tags.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {selectedRecord.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted/40 text-muted-foreground text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <MoreHorizontal className="w-8 h-8 opacity-30" />
              <span>选择一条记录查看详情</span>
            </div>
          )}
        </div>
      </div>

      {/* 截图预览弹窗 */}
      {showScreenshot && screenshotUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setShowScreenshot(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowScreenshot(false)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={screenshotUrl} alt="截图" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- 记录行组件 ----

function RecordItem({
  record,
  selected,
  onSelect,
  onDelete,
  onTogglePin,
  onCopy,
}: {
  record: ClipboardRecord
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
  onCopy: () => void
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
        selected ? 'bg-primary/15 text-foreground' : 'hover:bg-white/5 text-foreground/80'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate leading-snug">{record.text.split('\n')[0]}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{formatTime(record.timestamp)}</span>
            {record.screenshotFile && <Image className="w-3 h-3 text-muted-foreground" />}
            {record.analysis && <Sparkles className="w-3 h-3 text-primary/60" />}
          </div>
        </div>

        {showActions && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onCopy() }}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="复制"
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onTogglePin() }}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title={record.pinned ? '取消置顶' : '置顶'}
            >
              {record.pinned ? (
                <PinOff className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Pin className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1 rounded hover:bg-red-500/20 transition-colors cursor-pointer"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
