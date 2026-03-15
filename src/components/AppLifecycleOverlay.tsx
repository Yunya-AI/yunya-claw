import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export default function AppLifecycleOverlay() {
  const [phase, setPhase] = useState<'starting' | 'stopping' | null>(null)
  const [step, setStep] = useState('')
  const [steps, setSteps] = useState<string[]>([])

  useEffect(() => {
    if (!window.electronAPI?.lifecycle) return
    const unsub = window.electronAPI.lifecycle.onStep((data) => {
      if (!data.step) {
        // 空 step 表示阶段结束
        setPhase(null)
        setSteps([])
        return
      }
      setPhase(data.phase)
      setStep(data.step)
      setSteps(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] ${data.step}`])
    })
    return unsub
  }, [])

  if (!phase) return null

  const isStopping = phase === 'stopping'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] bg-[#1a1a1a] border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <Loader2 className={`w-5 h-5 animate-spin ${isStopping ? 'text-red-400' : 'text-primary'}`} />
          <span className="text-sm font-semibold text-foreground">
            {isStopping ? '正在关闭应用...' : '正在启动应用...'}
          </span>
        </div>

        {/* 当前步骤 */}
        <div className="px-5 pb-3">
          <p className="text-xs text-muted-foreground">{step}</p>
        </div>

        {/* 详细日志 */}
        <div className="mx-5 mb-5 bg-black/40 rounded-lg p-3 max-h-40 overflow-y-auto">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`text-xs font-mono py-0.5 ${
                i === steps.length - 1 ? 'text-foreground/80' : 'text-muted-foreground/60'
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* 进度条 */}
        <div className="h-1 bg-muted/20">
          <div
            className={`h-full animate-pulse ${isStopping ? 'bg-red-500/60' : 'bg-primary/60'}`}
            style={{ width: '100%', animation: 'indeterminate 1.5s ease-in-out infinite' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); width: 40%; }
          50% { transform: translateX(60%); width: 60%; }
          100% { transform: translateX(200%); width: 40%; }
        }
      `}</style>
    </div>
  )
}
