import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Search,
  Sparkles,
  FolderOpen,
  Loader2,
  RefreshCw,
  AlertCircle,
  Plus,
  Upload,
  Github,
  X,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SkillSource = 'bundled' | 'managed' | 'workspace'

interface Skill {
  name: string
  description: string
  emoji?: string
  source: SkillSource
  enabled: boolean
  skillKey: string
  requires?: Record<string, unknown>
}

const SOURCE_META: Record<SkillSource, { label: string; variant: 'default' | 'secondary' | 'success' }> = {
  bundled: { label: '内置', variant: 'default' },
  managed: { label: '已安装', variant: 'secondary' },
  workspace: { label: '工作区', variant: 'success' },
}

type InstallTab = 'zip' | 'github'
type InstallState = 'idle' | 'loading' | 'success' | 'error'

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState<'all' | SkillSource>('all')
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  // 安装对话框
  const [showInstall, setShowInstall] = useState(false)
  const [installTab, setInstallTab] = useState<InstallTab>('zip')
  const [installState, setInstallState] = useState<InstallState>('idle')
  const [installMsg, setInstallMsg] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSkills = useCallback(async () => {
    if (!window.electronAPI) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.skills.list()
      if (result.success) {
        setSkills(result.skills.map(s => ({
          ...s,
          skillKey: s.skillKey || s.name,
        })))
      } else {
        setError(result.error || '加载失败')
      }
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const toggleSkill = async (skill: Skill) => {
    const key = skill.skillKey
    const newEnabled = !skill.enabled
    setTogglingKey(key)

    // 乐观更新 UI
    setSkills(prev => prev.map(s => s.skillKey === key ? { ...s, enabled: newEnabled } : s))

    if (window.electronAPI) {
      const result = await window.electronAPI.skills.toggle(key, newEnabled)
      if (!result.success) {
        // 回滚
        setSkills(prev => prev.map(s => s.skillKey === key ? { ...s, enabled: !newEnabled } : s))
      }
    }
    setTogglingKey(null)
  }

  const openInstall = () => {
    setShowInstall(true)
    setInstallState('idle')
    setInstallMsg('')
    setGithubUrl('')
  }

  const closeInstall = () => {
    if (installState === 'loading') return
    setShowInstall(false)
  }

  const handleZipFile = async (file: File) => {
    if (!window.electronAPI) return
    setInstallState('loading')
    setInstallMsg(`正在安装 ${file.name}...`)
    try {
      const arrayBuf = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)))
      const result = await window.electronAPI.skills.installZip(base64, file.name)
      if (result.success) {
        setInstallState('success')
        setInstallMsg(`技能 "${result.skillName}" 安装成功`)
        await loadSkills()
      } else {
        setInstallState('error')
        setInstallMsg(result.error || '安装失败')
      }
    } catch (err) {
      setInstallState('error')
      setInstallMsg(String(err))
    }
  }

  const handleGithubInstall = async () => {
    if (!window.electronAPI || !githubUrl.trim()) return
    setInstallState('loading')
    setInstallMsg('正在从 GitHub 下载...')
    try {
      const result = await window.electronAPI.skills.installGithub(githubUrl.trim())
      if (result.success) {
        setInstallState('success')
        setInstallMsg(`技能 "${result.skillName}" 安装成功`)
        await loadSkills()
      } else {
        setInstallState('error')
        setInstallMsg(result.error || '安装失败')
      }
    } catch (err) {
      setInstallState('error')
      setInstallMsg(String(err))
    }
  }

  const filteredSkills = skills.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterSource === 'all' || s.source === filterSource
    return matchesSearch && matchesFilter
  })

  const counts = {
    all: skills.length,
    bundled: skills.filter(s => s.source === 'bundled').length,
    managed: skills.filter(s => s.source === 'managed').length,
    workspace: skills.filter(s => s.source === 'workspace').length,
  }

  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* 页头 */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              技能管理
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理 YunyaClaw 内置技能
              {!loading && (
                <span className="ml-2 text-xs">
                  共 {skills.length} 个，已启用 {enabledCount} 个
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadSkills}
              disabled={loading}
              className="gap-1.5 h-8 text-xs"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              刷新
            </Button>
            <Button
              size="sm"
              onClick={openInstall}
              className="gap-1.5 h-8 text-xs"
            >
              <Plus className="w-3 h-3" />
              安装技能
            </Button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 搜索和过滤 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索技能..."
              className="h-8 pl-9 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'bundled', 'managed', 'workspace'] as const).map(src => (
              <button
                key={src}
                onClick={() => setFilterSource(src)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap',
                  filterSource === src
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                {src === 'all' ? '全部' : SOURCE_META[src].label}
                <span className="ml-1 text-[10px] opacity-60">{counts[src]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">正在扫描技能目录...</span>
          </div>
        )}

        {/* 技能列表 */}
        {!loading && (
          <div className="space-y-2">
            {filteredSkills.map(skill => (
              <div
                key={skill.skillKey}
                className={cn(
                  'group flex items-start gap-4 p-4 rounded-lg border transition-all',
                  skill.enabled
                    ? 'border-border bg-card/50'
                    : 'border-border/40 bg-card/20 opacity-60'
                )}
              >
                {/* 图标 */}
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg select-none',
                  skill.source === 'bundled'
                    ? 'bg-primary/10'
                    : skill.source === 'managed'
                      ? 'bg-blue-500/10'
                      : 'bg-emerald-500/10'
                )}>
                  {skill.emoji ? (
                    <span>{skill.emoji}</span>
                  ) : skill.source === 'workspace' ? (
                    <FolderOpen className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Sparkles className={cn(
                      'w-5 h-5',
                      skill.source === 'bundled' ? 'text-primary' : 'text-blue-400'
                    )} />
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium font-mono">{skill.name}</span>
                    <Badge variant={SOURCE_META[skill.source].variant} className="text-[10px]">
                      {SOURCE_META[skill.source].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {skill.description || '暂无描述'}
                  </p>
                  {skill.requires && Object.keys(skill.requires).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(skill.requires.bins as string[] | undefined)?.map(bin => (
                        <span key={bin} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground font-mono">
                          {bin}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => toggleSkill(skill)}
                    disabled={togglingKey === skill.skillKey}
                  />
                </div>
              </div>
            ))}

            {filteredSkills.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">没有找到匹配的技能</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 安装技能对话框 */}
      {showInstall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && closeInstall()}
        >
          <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">安装技能</h2>
              <button
                onClick={closeInstall}
                disabled={installState === 'loading'}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-border">
              {([['zip', 'ZIP 文件', <Upload className="w-3.5 h-3.5" />], ['github', 'GitHub', <Github className="w-3.5 h-3.5" />]] as const).map(([tab, label, icon]) => (
                <button
                  key={tab}
                  onClick={() => { setInstallTab(tab); setInstallState('idle'); setInstallMsg('') }}
                  disabled={installState === 'loading'}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors',
                    installTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {/* ZIP 上传 */}
              {installTab === 'zip' && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleZipFile(file)
                      e.target.value = ''
                    }}
                  />
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault()
                      setDragOver(false)
                      const file = e.dataTransfer.files[0]
                      if (file?.name.endsWith('.zip')) handleZipFile(file)
                    }}
                    onClick={() => installState !== 'loading' && fileInputRef.current?.click()}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                      dragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-secondary/30'
                    )}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium">拖拽 ZIP 文件到此处</p>
                    <p className="text-xs text-muted-foreground mt-1">或点击选择文件</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-3">ZIP 内需包含 SKILL.md 文件</p>
                  </div>
                </div>
              )}

              {/* GitHub 安装 */}
              {installTab === 'github' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">GitHub 仓库地址</label>
                    <Input
                      value={githubUrl}
                      onChange={e => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/user/my-skill 或 user/repo"
                      className="h-9 text-sm font-mono"
                      disabled={installState === 'loading'}
                      onKeyDown={e => e.key === 'Enter' && handleGithubInstall()}
                    />
                    <p className="text-[10px] text-muted-foreground/70">
                      支持完整 URL 或简写 <span className="font-mono">user/repo</span>，仓库根目录需包含 SKILL.md
                    </p>
                  </div>
                  <Button
                    onClick={handleGithubInstall}
                    disabled={!githubUrl.trim() || installState === 'loading'}
                    className="w-full gap-2"
                    size="sm"
                  >
                    {installState === 'loading' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Github className="w-3.5 h-3.5" />
                    )}
                    {installState === 'loading' ? '安装中...' : '从 GitHub 安装'}
                  </Button>
                </div>
              )}

              {/* 状态反馈 */}
              {installState !== 'idle' && installMsg && (
                <div className={cn(
                  'flex items-start gap-2 p-3 rounded-lg text-xs',
                  installState === 'loading' && 'bg-secondary text-muted-foreground',
                  installState === 'success' && 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
                  installState === 'error' && 'bg-red-500/10 border border-red-500/20 text-red-400',
                )}>
                  {installState === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />}
                  {installState === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  {installState === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{installMsg}</span>
                </div>
              )}

              {/* 成功后关闭 */}
              {installState === 'success' && (
                <Button variant="outline" size="sm" className="w-full" onClick={closeInstall}>
                  关闭
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
