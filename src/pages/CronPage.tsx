import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2, Clock, Plus, Trash2, Play, ChevronDown, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGateway } from '@/contexts/GatewayContext'
import { useAgentContext } from '@/contexts/AgentContext'

type ScheduleKind = 'every' | 'at' | 'cron'
type PayloadKind = 'systemEvent' | 'agentTurn'

interface CronJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  agentId?: string
  schedule: { kind: string; everyMs?: number; at?: string; expr?: string; tz?: string }
  sessionTarget: string
  wakeMode: string
  payload: { kind: string; text?: string; message?: string }
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string }
}

function formatSchedule(job: CronJob): string {
  const s = job.schedule
  if (s.kind === 'every' && s.everyMs) {
    const min = Math.round(s.everyMs / 60000)
    if (min < 60) return `每 ${min} 分钟`
    const h = Math.floor(min / 60)
    return h < 24 ? `每 ${h} 小时` : `每 ${Math.floor(h / 24)} 天`
  }
  if (s.kind === 'at' && s.at) return `指定时间: ${s.at.slice(0, 16)}`
  if (s.kind === 'cron' && s.expr) return `Cron: ${s.expr}`
  return '未知'
}

function formatTime(ms?: number): string {
  if (!ms) return '-'
  const d = new Date(ms)
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CronPage({ active }: { active?: boolean }) {
  const { status: gatewayStatus, initializing: gatewayInitializing } = useGateway()
  const agentCtx = useAgentContext()
  const agents = agentCtx?.agents ?? []
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [status, setStatus] = useState<{ enabled?: boolean; jobs?: number; nextWakeAtMs?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // 新增表单
  const [name, setName] = useState('')
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('every')
  const [everyMinutes, setEveryMinutes] = useState('30')
  const [atTime, setAtTime] = useState('')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [payloadKind, setPayloadKind] = useState<PayloadKind>('agentTurn')
  const [payloadText, setPayloadText] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [agentId, setAgentId] = useState('')
  const [sessionTarget, setSessionTarget] = useState<'main' | 'isolated'>('isolated')

  const loadJobs = useCallback(async () => {
    if (!window.electronAPI?.cron || gatewayStatus !== 'running') return
    setLoading(true)
    setError(null)
    const res = await window.electronAPI.cron.list({ includeDisabled: true, limit: 100 })
    if (res.success && res.data?.jobs) {
      setJobs(res.data.jobs as CronJob[])
    } else {
      setError(res.error || '加载失败')
    }
    setLoading(false)
  }, [gatewayStatus])

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI?.cron || gatewayStatus !== 'running') return
    const res = await window.electronAPI.cron.status()
    if (res.success && res.data) setStatus(res.data as { enabled?: boolean; jobs?: number; nextWakeAtMs?: number })
  }, [gatewayStatus])

  useEffect(() => {
    if (gatewayStatus === 'running') {
      loadJobs()
      loadStatus()
    } else {
      setJobs([])
      setStatus(null)
    }
  }, [gatewayStatus, loadJobs, loadStatus])

  // 切换到本页时刷新任务列表
  useEffect(() => {
    if (active && gatewayStatus === 'running') {
      loadJobs()
      loadStatus()
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback(async (jobId: string) => {
    if (!window.electronAPI?.cron || !confirm('确定删除此定时任务？')) return
    const res = await window.electronAPI.cron.remove({ id: jobId })
    if (res.success) loadJobs()
    else setError(res.error || '删除失败')
  }, [loadJobs])

  const handleRun = useCallback(async (jobId: string) => {
    if (!window.electronAPI?.cron) return
    setError(null)
    const res = await window.electronAPI.cron.run({ id: jobId, mode: 'force' })
    if (!res.success) setError(res.error || '执行失败')
    else loadJobs()
  }, [loadJobs])

  const handleToggleEnabled = useCallback(async (job: CronJob) => {
    if (!window.electronAPI?.cron) return
    const res = await window.electronAPI.cron.update({ id: job.id, patch: { enabled: !job.enabled } })
    if (res.success) loadJobs()
    else setError(res.error || '更新失败')
  }, [loadJobs])

  const buildSchedule = useCallback(() => {
    if (scheduleKind === 'every') {
      const min = parseInt(everyMinutes, 10) || 30
      return { kind: 'every' as const, everyMs: min * 60 * 1000 }
    }
    if (scheduleKind === 'at') {
      const at = atTime.trim()
      if (!at) return null
      const iso = new Date(at).toISOString()
      return { kind: 'at' as const, at: iso }
    }
    return { kind: 'cron' as const, expr: cronExpr.trim() || '0 9 * * *' }
  }, [scheduleKind, everyMinutes, atTime, cronExpr])

  const handleAdd = useCallback(async () => {
    const schedule = buildSchedule()
    if (!schedule) {
      setAddError('请填写有效的调度配置')
      return
    }
    const text = payloadText.trim()
    if (!text) {
      setAddError(payloadKind === 'systemEvent' ? '请输入系统事件文本' : '请输入智能体任务提示')
      return
    }
    if (!name.trim()) {
      setAddError('请输入任务名称')
      return
    }

    setAdding(true)
    setAddError(null)
    const payload = payloadKind === 'systemEvent'
      ? { kind: 'systemEvent' as const, text }
      : { kind: 'agentTurn' as const, message: text }

    const params: Record<string, unknown> = {
      name: name.trim(),
      enabled,
      schedule,
      sessionTarget,
      wakeMode: 'now' as const,
      payload,
    }
    if (agentId.trim()) params.agentId = agentId.trim()

    const res = await window.electronAPI?.cron.add(params as Record<string, unknown>)
    if (res?.success) {
      setShowAddForm(false)
      setName('')
      setPayloadText('')
      setAgentId('')
      setEveryMinutes('30')
      setAtTime('')
      setCronExpr('0 9 * * *')
      loadJobs()
      loadStatus()
    } else {
      setAddError(res?.error || '添加失败')
    }
    setAdding(false)
  }, [buildSchedule, payloadKind, payloadText, name, enabled, sessionTarget, agentId, everyMinutes, atTime, cronExpr, loadJobs, loadStatus])

  if (gatewayStatus !== 'running') {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <Clock className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">
          {gatewayStatus === 'starting'
            ? gatewayInitializing ? '应用初始化中...' : '应用启动中...'
            : '请先到控制台启动应用'}
        </p>
        {gatewayStatus === 'starting' && <Loader2 className="w-6 h-6 mt-3 animate-spin" />}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">定时</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          管理 OpenClaw 定时任务，支持按间隔、指定时间或 Cron 表达式执行。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* 状态栏 */}
        <div className="flex items-center gap-4 mb-6 text-sm">
          <span className="text-muted-foreground">
            定时服务：{status?.enabled ? '已启用' : '未启用'}
          </span>
          <span className="text-muted-foreground">任务数：{status?.jobs ?? jobs.length}</span>
          {status?.nextWakeAtMs && (
            <span className="text-muted-foreground">下次唤醒：{formatTime(status.nextWakeAtMs)}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => { loadJobs(); loadStatus() }} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '刷新'}
          </Button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm">{error}</div>
        )}

        {/* 任务列表 */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">任务列表</h2>
            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="w-4 h-4 mr-1" />
              新增任务
            </Button>
          </div>

          {loading && jobs.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              加载中...
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">暂无定时任务</div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {jobs.map(job => (
                <div
                  key={job.id}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3',
                    !job.enabled && 'opacity-60'
                  )}
                >
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={() => handleToggleEnabled(job)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{job.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatSchedule(job)} · {job.payload.kind === 'agentTurn' ? '智能体任务' : '系统事件'}
                      {job.agentId && ` · ${agents.find(a => a.id === job.agentId)?.name || job.agentId}`}
                      {job.state?.nextRunAtMs && ` · 下次: ${formatTime(job.state.nextRunAtMs)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleRun(job.id)} title="立即执行">
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(job.id)} title="删除">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新增表单 */}
        {showAddForm && (
          <div className="border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <ChevronDown className="w-4 h-4" />
              新增定时任务
            </h3>

            {addError && (
              <div className="px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm">{addError}</div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">任务名称 *</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="如：每日摘要"
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-4 pt-6">
                <label className="text-sm font-medium">启用</label>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">调度方式</label>
              <div className="flex gap-4 mt-2">
                {(['every', 'at', 'cron'] as ScheduleKind[]).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={scheduleKind === k}
                      onChange={() => setScheduleKind(k)}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {k === 'every' ? '按间隔' : k === 'at' ? '指定时间' : 'Cron 表达式'}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2">
                {scheduleKind === 'every' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={everyMinutes}
                      onChange={e => setEveryMinutes(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">分钟</span>
                  </div>
                )}
                {scheduleKind === 'at' && (
                  <div className="relative w-[200px]">
                    <Input
                      type="datetime-local"
                      value={atTime}
                      onChange={e => setAtTime(e.target.value)}
                      className="datetime-input pr-9 w-full"
                    />
                    <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none shrink-0" />
                  </div>
                )}
                {scheduleKind === 'cron' && (
                  <Input
                    value={cronExpr}
                    onChange={e => setCronExpr(e.target.value)}
                    placeholder="0 9 * * *"
                    className="font-mono max-w-xs"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">执行内容</label>
              <div className="flex gap-4 mt-2">
                {(['agentTurn', 'systemEvent'] as PayloadKind[]).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={payloadKind === k}
                      onChange={() => setPayloadKind(k)}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {k === 'agentTurn' ? '智能体任务' : '系统事件'}
                    </span>
                  </label>
                ))}
              </div>
              <Input
                value={payloadText}
                onChange={e => setPayloadText(e.target.value)}
                placeholder={payloadKind === 'agentTurn' ? '给智能体的提示，如：总结今日待办' : '系统事件文本'}
                className="mt-2"
              />
              {payloadKind === 'agentTurn' && (
                <div>
                  <label className="text-sm font-medium">所属数字人</label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sessionTarget === 'main' ? '主会话仅支持默认智能体' : '选择任务运行的智能体，留空使用默认（main）'}
                  </p>
                  <Select
                    value={sessionTarget === 'main' ? '' : agentId}
                    onChange={v => setAgentId(v)}
                    disabled={sessionTarget === 'main'}
                    options={[
                      { value: '', label: '默认（main）' },
                      ...agents.filter(a => a.id !== 'main').map(a => ({ value: a.id, label: a.name })),
                    ]}
                    className="mt-2"
                    fullWidth
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">会话目标</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={sessionTarget === 'isolated'}
                    onChange={() => setSessionTarget('isolated')}
                    className="rounded"
                  />
                  <span className="text-sm">独立会话</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={sessionTarget === 'main'}
                    onChange={() => {
                      setSessionTarget('main')
                      if (agentId && agentId !== 'main') setAgentId('')
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">主会话（仅默认智能体）</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                添加
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)} disabled={adding}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
