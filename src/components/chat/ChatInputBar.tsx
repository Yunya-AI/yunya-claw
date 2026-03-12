import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Square, ChevronDown, Slash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHAT_COMMANDS } from '@/constants/chatCommands'

interface ModelOption {
  fullId: string
  displayName: string
  provider: string
}

interface Props {
  onSend: (content: string) => void
  canSend: boolean
  streaming: boolean
  onStop: () => void
  model: string
  models: ModelOption[]
  modelReady?: boolean
  onModelChange: (fullId: string) => void
  gatewayPort: number
  gatewayStatus: string
  gatewayInitializing?: boolean
}

export default function ChatInputBar({
  onSend,
  canSend,
  streaming,
  onStop,
  model,
  models,
  modelReady = false,
  onModelChange,
  gatewayPort,
  gatewayStatus,
  gatewayInitializing = false,
}: Props) {
  const [input, setInput] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commandsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCommands) return
    const onOutside = (e: MouseEvent) => {
      if (commandsRef.current && !commandsRef.current.contains(e.target as Node)) {
        setShowCommands(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showCommands])

  const handleSubmit = useCallback(() => {
    const content = input.trim()
    if (!content || !canSend) return
    onSend(content)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, canSend, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0" ref={commandsRef}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => setShowCommands(prev => !prev)}
              title="快捷指令"
            >
              <Slash className="w-4 h-4" />
            </Button>
            {showCommands && (
              <div className="absolute bottom-12 left-0 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[260px] max-h-[280px] overflow-y-auto z-50">
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground/70 border-b border-border mb-1">
                  支持的指令（点击直接发送）
                </div>
                {CHAT_COMMANDS.map(c => (
                  <button
                    key={c.cmd}
                    onClick={() => {
                      setShowCommands(false)
                      onSend(c.cmd)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors"
                  >
                    <code className="text-primary">{c.cmd}</code>
                    <span className="text-muted-foreground ml-2">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                autoResize(e.target)
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                streaming
                  ? 'AI 正在回复...'
                  : canSend
                    ? '输入消息... (Shift+Enter 换行)'
                    : (gatewayStatus === 'starting' ? (gatewayInitializing ? '应用初始化中...' : '应用启动中...') : '应用已停止')
              }
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm
                focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50
                placeholder:text-muted-foreground/60 max-h-[200px] scrollbar-thin"
              disabled={!canSend}
            />
          </div>
          {streaming ? (
            <Button
              onClick={onStop}
              size="icon"
              variant="destructive"
              className="h-10 w-10 rounded-xl shrink-0"
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              size="icon"
              disabled={!input.trim() || !canSend}
              className="h-10 w-10 rounded-xl shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 mt-1.5 text-[10px] text-muted-foreground/50">
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(prev => !prev)}
              className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
            >
              <span>模型: {!modelReady ? '加载中…' : (models.find(m => m.fullId === model)?.displayName || model || '未配置')}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showModelPicker && models.length > 0 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[220px] max-h-[200px] overflow-y-auto z-50">
                {models.map(m => (
                  <button
                    key={m.fullId}
                    onClick={() => {
                      onModelChange(m.fullId)
                      setShowModelPicker(false)
                    }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors',
                      model === m.fullId ? 'text-primary font-medium' : 'text-muted-foreground'
                    )}
                  >
                    <span className="text-muted-foreground/60">{m.provider}/</span>{m.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span>·</span>
          <span>应用: 127.0.0.1:{gatewayPort}</span>
          {gatewayStatus !== 'running' && <span className="text-red-400 ml-1">（{gatewayStatus === 'starting' ? (gatewayInitializing ? '初始化中' : '启动中') : '未运行'}）</span>}
        </div>
      </div>
    </div>
  )
}
