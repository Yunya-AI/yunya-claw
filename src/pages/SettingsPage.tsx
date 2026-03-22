import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Settings,
  Save,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
  Palette,
  Upload,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppearance } from '@/contexts/AppearanceContext'

interface EnvEntry {
  id: string
  key: string
  value: string
  showValue: boolean
}

export default function SettingsPage({ active = true }: { active?: boolean }) {
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 环境变量
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envSaving, setEnvSaving] = useState(false)
  const newKeyRef = useRef<HTMLInputElement>(null)
  const newValRef = useRef<HTMLInputElement>(null)

  // 备份恢复
  const [backupCreating, setBackupCreating] = useState(false)
  const [backupRestoring, setBackupRestoring] = useState(false)
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 应用外观
  const [appName, setAppName] = useState('Yunya Claw')
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null)
  const [hasCustomIcon, setHasCustomIcon] = useState(false)
  const [appearanceLoading, setAppearanceLoading] = useState(false)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const { refresh: refreshAppearance } = useAppearance()

  const loadAppearance = useCallback(async () => {
    if (!window.electronAPI?.appearance) return
    setAppearanceLoading(true)
    try {
      const res = await window.electronAPI.appearance.get()
      if (res) {
        setAppName(res.appName)
        setHasCustomIcon(res.hasCustomIcon)
      }
      const dataUrl = await window.electronAPI.appearance.getIconDataUrl()
      setIconDataUrl(dataUrl)
    } catch (err) {
      console.error('读取外观失败:', err)
    }
    setAppearanceLoading(false)
  }, [])

  useEffect(() => {
    if (active) loadAppearance()
  }, [active, loadAppearance])

  // 加载环境变量
  const loadEnv = useCallback(async () => {
    if (!window.electronAPI) return
    setEnvLoading(true)
    try {
      const result = await window.electronAPI.env.read()
      if (result.success) {
        setEnvEntries(result.entries.map((e, i) => ({ id: `env-${i}-${Date.now()}`, ...e, showValue: false })))
      }
    } catch (err) {
      console.error('读取 .env 失败:', err)
    }
    setEnvLoading(false)
  }, [])

  useEffect(() => {
    if (active) loadEnv()
  }, [active, loadEnv])

  const handleAppNameSave = useCallback(async () => {
    if (!window.electronAPI?.appearance?.setAppName) return
    setAppearanceSaving(true)
    try {
      await window.electronAPI.appearance.setAppName(appName)
      await refreshAppearance()
    } catch (err) {
      console.error('保存应用名称失败:', err)
    }
    setAppearanceSaving(false)
  }, [appName, refreshAppearance])

  const handleIconUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/') || !window.electronAPI?.appearance?.setIcon) return
    setAppearanceSaving(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const match = result.match(/^data:image\/\w+;base64,(.+)$/)
          resolve(match ? match[1] : result)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await window.electronAPI.appearance.setIcon(base64)
      if (res.success) {
        setHasCustomIcon(true)
        setIconDataUrl(await window.electronAPI.appearance.getIconDataUrl())
        await refreshAppearance()
      }
    } catch (err) {
      console.error('上传图标失败:', err)
    }
    setAppearanceSaving(false)
  }, [refreshAppearance])

  const handleClearIcon = useCallback(async () => {
    if (!window.electronAPI?.appearance?.clearIcon) return
    setAppearanceSaving(true)
    try {
      await window.electronAPI.appearance.clearIcon()
      setHasCustomIcon(false)
      setIconDataUrl(null)
      await refreshAppearance()
    } catch (err) {
      console.error('恢复默认图标失败:', err)
    }
    setAppearanceSaving(false)
  }, [refreshAppearance])

  const handleRefreshAll = useCallback(async () => {
    await loadEnv()
  }, [loadEnv])

  const handleBackup = useCallback(async () => {
    if (!window.electronAPI?.backup?.create) return
    setBackupMessage(null)
    setBackupCreating(true)
    try {
      const res = await window.electronAPI.backup.create()
      if (res.canceled) return
      if (res.success && res.filePath) {
        setBackupMessage({ type: 'success', text: `备份已保存至 ${res.filePath}` })
      } else {
        setBackupMessage({ type: 'error', text: res.error || '备份失败' })
      }
    } catch (err) {
      setBackupMessage({ type: 'error', text: String(err) })
    }
    setBackupCreating(false)
  }, [])

  const handleRestore = useCallback(async () => {
    if (!window.electronAPI?.backup?.restore) return
    if (!confirm('确定要从备份恢复吗？当前配置将被覆盖，建议先备份。')) return
    setBackupMessage(null)
    setBackupRestoring(true)
    try {
      const res = await window.electronAPI.backup.restore()
      if (res.canceled) return
      if (res.success) {
        setBackupMessage({ type: 'success', text: '恢复成功，请刷新或重启应用使配置生效' })
        await loadEnv()
      } else {
        setBackupMessage({ type: 'error', text: res.error || '恢复失败' })
      }
    } catch (err) {
      setBackupMessage({ type: 'error', text: String(err) })
    }
    setBackupRestoring(false)
  }, [loadEnv])

  const saveEnvOnly = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI) return false
    setEnvSaving(true)
    // 合并已添加的条目 + 新增输入框中未点 + 的待添加内容
    const entries = envEntries.filter(e => e.key.trim()).map(e => ({ key: e.key.trim(), value: e.value }))
    const newKey = newKeyRef.current?.value?.trim()
    const newVal = newKey ? (newValRef.current?.value ?? '') : ''
    if (newKey) {
      entries.push({ key: newKey, value: newVal })
    }
    const result = await window.electronAPI.env.write(entries)
    if (result.success && newKey) {
      setEnvEntries(prev => [...prev, { id: `env-${Date.now()}`, key: newKey, value: newVal, showValue: false }])
      if (newKeyRef.current) newKeyRef.current.value = ''
      if (newValRef.current) newValRef.current.value = ''
    }
    setEnvSaving(false)
    return result.success
  }, [envEntries])

  const handleSaveAll = useCallback(async () => {
    setSaveMessage(null)
    const envOk = await saveEnvOnly()
    setSaveMessage(envOk ? { type: 'success', text: '已保存' } : { type: 'error', text: '保存失败' })
    setTimeout(() => setSaveMessage(null), 3000)
  }, [saveEnvOnly])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* 页头 */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              设置
            </h1>
            <p className="text-sm text-muted-foreground mt-1">环境变量（.env）与应用外观</p>
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className={cn('text-xs', saveMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400')}>
                {saveMessage.text}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshAll}
              disabled={envLoading}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={cn('w-3 h-3', envLoading && 'animate-spin')} />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saving || envSaving}
              className="gap-1.5 h-8 text-xs"
            >
              {(saving || envSaving) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              保存
            </Button>
          </div>
        </div>

        {/* 环境变量 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              环境变量
              <span className="text-xs text-muted-foreground font-normal">（~/.openclaw/.env）</span>
            </h2>
          </div>

          <p className="text-xs text-muted-foreground">
            应用启动时会自动加载这些环境变量，可用于配置 API Key、代理等。修改后需重启应用才能生效。
          </p>

          {/* 条目列表 */}
          <div className="space-y-2">
            {envEntries.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 group">
                <Input
                  value={entry.key}
                  onChange={e => setEnvEntries(prev => prev.map(en => en.id === entry.id ? { ...en, key: e.target.value } : en))}
                  placeholder="key"
                  className="h-8 text-xs font-mono w-40 shrink-0"
                />
                <span className="text-muted-foreground text-sm shrink-0">=</span>
                <div className="relative flex-1">
                  <Input
                    type={entry.showValue ? 'text' : 'password'}
                    value={entry.value}
                    onChange={e => setEnvEntries(prev => prev.map(en => en.id === entry.id ? { ...en, value: e.target.value } : en))}
                    placeholder="value"
                    className="h-8 text-xs font-mono pr-8"
                  />
                  <button
                    onClick={() => setEnvEntries(prev => prev.map(en => en.id === entry.id ? { ...en, showValue: !en.showValue } : en))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {entry.showValue ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={() => setEnvEntries(prev => prev.filter(en => en.id !== entry.id))}
                  className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* 新增行 */}
            <div className="flex items-center gap-2 pt-1">
              <Input
                ref={newKeyRef}
                placeholder="新增 KEY"
                className="h-8 text-xs font-mono w-40 shrink-0"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    newValRef.current?.focus()
                  }
                }}
              />
              <span className="text-muted-foreground text-sm shrink-0">=</span>
              <Input
                ref={newValRef}
                placeholder="value"
                className="h-8 text-xs font-mono flex-1"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const k = newKeyRef.current?.value.trim()
                    const v = newValRef.current?.value ?? ''
                    if (k) {
                      setEnvEntries(prev => [...prev, { id: `env-new-${Date.now()}`, key: k, value: v, showValue: false }])
                      if (newKeyRef.current) newKeyRef.current.value = ''
                      if (newValRef.current) newValRef.current.value = ''
                      newKeyRef.current?.focus()
                    }
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0"
                onClick={() => {
                  const k = newKeyRef.current?.value.trim()
                  const v = newValRef.current?.value ?? ''
                  if (k) {
                    setEnvEntries(prev => [...prev, { id: `env-new-${Date.now()}`, key: k, value: v, showValue: false }])
                    if (newKeyRef.current) newKeyRef.current.value = ''
                    if (newValRef.current) newValRef.current.value = ''
                    newKeyRef.current?.focus()
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </section>

        {/* 应用外观 */}
        {window.electronAPI?.appearance && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">应用外观</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              自定义应用名称和图标，修改后窗口标题和任务栏图标会立即更新。
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 items-center">
              <label className="text-xs font-medium text-muted-foreground">应用图标</label>
              <label className="text-xs font-medium text-muted-foreground">应用名称</label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg border border-border bg-secondary/50 flex items-center justify-center overflow-hidden shrink-0">
                  {appearanceLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <img
                      src={iconDataUrl || `${import.meta.env.BASE_URL}icon.png`}
                      alt="应用图标"
                      className="w-10 h-10 object-contain"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={handleIconUpload}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    disabled={appearanceSaving}
                    onClick={() => iconInputRef.current?.click()}
                  >
                    {appearanceSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    上传
                  </Button>
                  {hasCustomIcon && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-8 text-xs text-muted-foreground"
                      disabled={appearanceSaving}
                      onClick={handleClearIcon}
                    >
                      <RotateCcw className="w-3 h-3" />
                      恢复默认
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  onBlur={handleAppNameSave}
                  placeholder="Yunya Claw"
                  className="h-8 text-sm w-40 max-w-48"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs shrink-0"
                  disabled={appearanceSaving}
                  onClick={handleAppNameSave}
                >
                  {appearanceSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : '保存'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 备份恢复 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">备份恢复</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            备份配置相关文件：openclaw.json、yunyaClaw.json、.env、workspace/workspaces 人设、cron/jobs.json、agents/*/agent/models.json、settings/、credentials/、exec-approvals.json（不含图片等媒体文件）。仅备份配置，未备份聊天记录、memory 等会话数据。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              disabled={backupCreating}
              onClick={handleBackup}
            >
              {backupCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              立即备份
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              disabled={backupRestoring}
              onClick={handleRestore}
            >
              {backupRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
              从备份中恢复
            </Button>
          </div>
          {backupMessage && (
            <p className={cn('text-xs', backupMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400')}>
              {backupMessage.text}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
