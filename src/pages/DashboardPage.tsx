import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Activity, Power, PowerOff, Terminal } from 'lucide-react'
import { useGateway } from '@/contexts/GatewayContext'
import { useAppearance } from '@/contexts/AppearanceContext'

const STATUS_CONFIG = {
  stopped:  { color: 'bg-zinc-500',   text: '已停止',  pulse: false },
  starting: { color: 'bg-yellow-500', text: '启动中...', pulse: true  },
  running:  { color: 'bg-emerald-500',text: '运行中',   pulse: true  },
  error:    { color: 'bg-red-500',    text: '错误',     pulse: false },
}

export default function DashboardPage() {
  const { status, initializing, port, logs, start, stop, clearLogs } = useGateway()
  const { appName, iconDataUrl } = useAppearance()
  const logEndRef = useRef<HTMLDivElement>(null)
  const statusText = status === 'starting' && initializing ? '初始化中...' : STATUS_CONFIG[status].text
  const currentStatus = { ...STATUS_CONFIG[status], text: statusText }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 状态面板 */}
      <div className="p-6 border-b border-border">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-5 mb-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shadow-lg shadow-orange-500/20 bg-muted/30">
                <img src={iconDataUrl || `${import.meta.env.BASE_URL}icon.png`} alt="" className="w-full h-full object-cover" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${currentStatus.color} ${currentStatus.pulse ? 'animate-pulse' : ''}`} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold mb-0.5">{appName}</h1>
              <p className="text-muted-foreground text-xs">个人 AI 助手控制面板</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span>状态:</span>
              <span className={`font-medium ${
                status === 'running' ? 'text-emerald-400' :
                status === 'error'   ? 'text-red-400'     :
                'text-muted-foreground'
              }`}>
                {currentStatus.text}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span>端口: {port}</span>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            {status === 'stopped' || status === 'error' ? (
              <Button onClick={start} size="sm" className="gap-2 px-5">
                <Power className="w-3.5 h-3.5" />
                启动应用
              </Button>
            ) : (
              <Button onClick={stop} variant="destructive" size="sm" className="gap-2 px-5">
                <PowerOff className="w-3.5 h-3.5" />
                停止应用
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 日志 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-card/30">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">日志输出</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearLogs}>
            清空
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>{status === 'running' ? '暂无日志' : (initializing ? '应用初始化中...' : '应用启动中...')}</p>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`py-0.5 ${log.includes('[错误]') ? 'text-red-400' : 'text-muted-foreground'}`}>
                {log}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
