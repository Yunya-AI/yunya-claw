import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'error'

interface GatewayContextValue {
  status: GatewayStatus
  initializing: boolean
  port: number
  token: string
  logs: string[]
  start: () => Promise<void>
  stop: () => Promise<void>
  clearLogs: () => void
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GatewayStatus>('starting')
  const [initializing, setInitializing] = useState(false)
  const [port, setPort] = useState(18789)
  const [token, setToken] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-500), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.gateway.token().then(t => setToken(t))

    const unLog = window.electronAPI.gateway.onLog(msg => addLog(msg.trim()))
    const unError = window.electronAPI.gateway.onError(msg => addLog(`[错误] ${msg.trim()}`))
    const unStatus = window.electronAPI.gateway.onStatus((s: { running?: boolean; starting?: boolean; initializing?: boolean; port?: number; code?: number }) => {
      if (s.running) {
        setStatus('running')
        setInitializing(false)
        if (s.port) setPort(s.port)
        addLog(`应用已就绪 (端口: ${s.port || port})`)
        // Gateway 启动后才写入 token，需重新获取
        window.electronAPI.gateway.token().then(t => setToken(t))
      } else if (s.starting) {
        setStatus('starting')
        setInitializing(s.initializing ?? false)
        addLog(s.initializing ? '正在初始化插件...' : '正在启动应用...')
      } else {
        setStatus('stopped')
        setInitializing(false)
        if (s.port) setPort(s.port)
        addLog(`应用已停止 (code: ${s.code ?? 0})`)
      }
    })

    // 注册完监听后再查一次状态，防止 gateway 在渲染进程挂载前就已 running 导致事件丢失
    window.electronAPI.gateway.status().then(s => {
      if (s.running) {
        setStatus('running')
        setInitializing(false)
        if (s.port) setPort(s.port)
        window.electronAPI.gateway.token().then(t => setToken(t))
      }
      // starting 或 stopped 状态由 onStatus 事件驱动，无需处理
    })

    return () => {
      unLog?.()
      unError?.()
      unStatus?.()
    }
  }, [addLog]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (!window.electronAPI) return
    setStatus('starting')
    addLog('正在启动应用...')
    const result = await window.electronAPI.gateway.start()
    if (result.port) setPort(result.port)
  }, [addLog])

  const stop = useCallback(async () => {
    if (!window.electronAPI) return
    addLog('正在停止应用...')
    await window.electronAPI.gateway.stop()
  }, [addLog])

  const clearLogs = useCallback(() => setLogs([]), [])

  return (
    <GatewayContext.Provider value={{ status, initializing, port, token, logs, start, stop, clearLogs }}>
      {children}
    </GatewayContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGateway() {
  const ctx = useContext(GatewayContext)
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGatewayStatus(): GatewayStatus {
  return useGateway().status
}
