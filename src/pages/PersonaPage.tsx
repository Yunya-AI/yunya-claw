import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Save, Loader2, Bot, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/AgentAvatar'
import { useAgentContext } from '@/contexts/AgentContext'
import { useGateway } from '@/contexts/GatewayContext'
import { useAppearance } from '@/contexts/AppearanceContext'

interface WorkspaceFile {
  file: string
  title: string
  desc: string
  size: number
  configured: boolean
}

const FILE_KEY_MAP: Record<string, string> = {
  'AGENTS.md': 'agents',
  'SOUL.md': 'soul',
  'IDENTITY.md': 'identity',
  'USER.md': 'user',
  'TOOLS.md': 'tools',
  'HEARTBEAT.md': 'heartbeat',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function parseMdField(content: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`[-*]?\\s*\\*\\*${escaped}\\*\\*\\s*[:：]?\\s*(.+?)(?=\\n|$)`, 'm')
    const m = content.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

/** 是否展示普通模式/原始文件切换，设为 false 时仅显示原始文件编辑 */
const SHOW_SIMPLE_MODE = false

const SIMPLE_HINTS: Record<string, string> = {
  'AGENTS.md': '填写操作指令、记忆规则、行为准则等，支持 Markdown 格式',
  'SOUL.md': '描述智能体的性格、说话风格和价值观',
  'IDENTITY.md': '设置名称、角色类型、风格等',
  'USER.md': '填写你的姓名、称呼偏好等信息',
  'TOOLS.md': '记录工具使用说明和约定',
  'HEARTBEAT.md': '列出定期检查的事项，每行一条',
}

export default function PersonaPage({ active = true }: { active?: boolean }) {
  const { appName, iconDataUrl } = useAppearance()

  const { status: gatewayStatus, initializing: gatewayInitializing } = useGateway()
  const agentCtx = useAgentContext()
  const agents = agentCtx?.agents ?? []
  const activeAgentId = agentCtx?.activeAgentId
  const selectedAgentId = activeAgentId || agents[0]?.id || 'main'

  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editingFile, setEditingFile] = useState<WorkspaceFile | null>(null)
  const [editMode, setEditMode] = useState<'simple' | 'raw'>('simple')
  const [editContent, setEditContent] = useState('')
  const [simpleForm, setSimpleForm] = useState<{
    identity?: { name: string; creature: string; vibe: string; emoji: string; avatar: string }
    soul?: string
    user?: { name: string; preferredAddress: string; notes: string }
  }>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingFilePath, setEditingFilePath] = useState<string | null>(null)
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false)
      }
    }
    if (agentDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [agentDropdownOpen])

  useEffect(() => {
    if (active && gatewayStatus === 'running' && agents.length === 0 && window.electronAPI?.agents) {
      window.electronAPI.agents.list().then((res) => {
        if (res.success && res.data) {
          const raw = res.data as { agents?: { id: string; name?: string; identity?: { name?: string; emoji?: string; avatar?: string } }[]; defaultId?: string }
          const list = Array.isArray(raw.agents) ? raw.agents : []
          const tabs = list.map((a) => ({
            id: a.id,
            name: a.id === 'main' ? appName : (a.identity?.name || a.name || a.id),
            emoji: a.id === 'main' ? undefined : (a.identity?.emoji || undefined),
            avatar: a.id === 'main' ? undefined : (a.identity?.avatar || undefined),
          }))
          if (tabs.length > 0) {
            agentCtx?.setAgents(tabs)
            if (!agentCtx?.activeAgentId) {
              agentCtx?.setActiveAgentId(raw.defaultId || tabs[0].id)
            }
          }
        }
      })
    }
  }, [active, gatewayStatus, agents.length, agentCtx, appName])

  const loadFiles = useCallback(async (agentId: string) => {
    if (!window.electronAPI?.persona) return
    setLoading(true)
    try {
      const res = await window.electronAPI.persona.listFiles(agentId)
      if (res.success && res.files) {
        setFiles(res.files)
      }
    } catch (err) {
      setMessage({ type: 'error', text: '加载失败：' + String(err) })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (active && selectedAgentId && window.electronAPI?.persona) {
      loadFiles(selectedAgentId)
    }
  }, [active, selectedAgentId, loadFiles])

  const openEditor = useCallback(async (f: WorkspaceFile) => {
    if (!window.electronAPI?.persona) return
    setEditingFile(f)
    setEditMode(SHOW_SIMPLE_MODE ? 'simple' : 'raw')
    setEditingFilePath(null)
    const fileKey = FILE_KEY_MAP[f.file] || f.file.replace('.md', '')
    const [fileRes, pathRes] = await Promise.all([
      window.electronAPI.persona.getFile({ agentId: selectedAgentId, file: fileKey }),
      window.electronAPI.persona.getWorkspacePath(selectedAgentId),
    ])
    if (pathRes.success && pathRes.path) {
      setEditingFilePath(`${pathRes.path.replace(/[/\\]+$/, '')}/${f.file}`)
    }
    const res = fileRes
    const raw = res.success ? (res.content ?? '') : ''
    setEditContent(raw)
    if (f.file === 'IDENTITY.md') {
      setSimpleForm({
        identity: {
          name: parseMdField(raw, ['名称', 'Name']),
          creature: parseMdField(raw, ['角色类型', 'Creature']),
          vibe: parseMdField(raw, ['风格', 'Vibe']),
          emoji: parseMdField(raw, ['表情符号', 'Emoji']),
          avatar: parseMdField(raw, ['头像', 'Avatar']),
        },
      })
    } else if (f.file === 'USER.md') {
      setSimpleForm({
        user: {
          name: parseMdField(raw, ['姓名', 'Name']),
          preferredAddress: parseMdField(raw, ['称呼偏好', 'Preferred address', 'Preferred Address']),
          notes: parseMdField(raw, ['备注', 'Notes']),
        },
      })
    } else if (f.file === 'SOUL.md') {
      setSimpleForm({ soul: raw })
    } else {
      setSimpleForm({})
    }
  }, [selectedAgentId])

  const closeEditor = useCallback(() => {
    setEditingFile(null)
    setEditContent('')
    setSimpleForm({})
    setEditingFilePath(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!editingFile || !window.electronAPI?.persona) return
    setSaving(true)
    setMessage(null)
    try {
      let ok = false
      if (editMode === 'simple' && (editingFile.file === 'IDENTITY.md' || editingFile.file === 'USER.md' || editingFile.file === 'SOUL.md')) {
        if (editingFile.file === 'IDENTITY.md' && simpleForm.identity) {
          const res = await window.electronAPI.persona.saveSimple({
            agentId: selectedAgentId,
            identity: simpleForm.identity,
          })
          ok = res.success
        } else if (editingFile.file === 'USER.md' && simpleForm.user) {
          const res = await window.electronAPI.persona.saveSimple({
            agentId: selectedAgentId,
            user: simpleForm.user,
          })
          ok = res.success
        } else if (editingFile.file === 'SOUL.md' && simpleForm.soul !== undefined) {
          const res = await window.electronAPI.persona.saveSimple({
            agentId: selectedAgentId,
            soul: simpleForm.soul,
          })
          ok = res.success
        }
      } else {
        const fileKey = FILE_KEY_MAP[editingFile.file] || editingFile.file.replace('.md', '')
        const res = await window.electronAPI.persona.saveFile({
          agentId: selectedAgentId,
          file: fileKey,
          content: editContent,
        })
        ok = res.success
      }
      if (ok) {
        setMessage({ type: 'success', text: '已保存' })
        closeEditor()
        loadFiles(selectedAgentId)
      } else {
        setMessage({ type: 'error', text: '保存失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败：' + String(err) })
    }
    setSaving(false)
  }, [editingFile, editMode, editContent, simpleForm, selectedAgentId, closeEditor, loadFiles])

  if (gatewayStatus !== 'running') {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">{gatewayStatus === 'starting' ? (gatewayInitializing ? '应用初始化中...' : '应用启动中...') : '应用已停止，请到控制台重新启动'}</p>
          {gatewayStatus === 'starting' && <Loader2 className="w-5 h-5 mx-auto mt-3 animate-spin text-muted-foreground/50" />}
        </div>
      </div>
    )
  }

  const currentAgent = agents.find((a) => a.id === selectedAgentId)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 顶部：Agent 选择 + 概览 */}
      <div className="shrink-0 p-6 pb-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold">设定</h1>
            {agents.length > 1 && (
              <div className="relative" ref={agentDropdownRef}>
                <button
                  type="button"
                  onClick={() => setAgentDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm hover:bg-muted/70 transition-colors"
                >
                  <div className="w-5 h-5 rounded overflow-hidden shrink-0 flex items-center justify-center">
                    <AgentAvatar
                      avatar={currentAgent?.avatar}
                      agentId={currentAgent?.id}
                      emoji={currentAgent?.emoji}
                      isMain={currentAgent?.id === 'main'}
                      iconDataUrl={iconDataUrl}
                      className="w-5 h-5"
                    />
                  </div>
                  <span>{currentAgent?.name || selectedAgentId}</span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', agentDropdownOpen && 'rotate-180')} />
                </button>
                {agentDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 w-full py-1 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                    {agents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          agentCtx?.setActiveAgentId(a.id)
                          setAgentDropdownOpen(false)
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors',
                          selectedAgentId === a.id && 'bg-primary/10 text-primary'
                        )}
                      >
                        <div className="w-5 h-5 rounded overflow-hidden shrink-0 flex items-center justify-center">
                          <AgentAvatar
                            avatar={a.avatar}
                            agentId={a.id}
                            emoji={a.emoji}
                            isMain={a.id === 'main'}
                            iconDataUrl={iconDataUrl}
                            className="w-5 h-5"
                          />
                        </div>
                        <span className="truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {currentAgent && (
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                <AgentAvatar
                  avatar={currentAgent.avatar}
                  agentId={currentAgent.id}
                  emoji={currentAgent.emoji}
                  isMain={currentAgent.id === 'main'}
                  iconDataUrl={iconDataUrl}
                  className="w-full h-full"
                />
              </div>
              <div>
                <div className="font-medium">{currentAgent.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {selectedAgentId} · {files.filter((f) => f.configured).length} 个已配置
                </div>
              </div>
            </div>
          )}

          {message && (
            <div
              className={cn(
                'mb-4 px-3 py-2 rounded-lg text-sm',
                message.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
              )}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-6 pt-4 pb-8 max-w-4xl mx-auto">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Workspace 文件</h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((f) => (
                <button
                  key={f.file}
                  onClick={() => openEditor(f)}
                  className="text-left p-4 rounded-xl border border-border bg-card hover:bg-muted/30 hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">{f.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{f.desc}</div>
                      <div className="mt-2 text-xs text-muted-foreground">{f.file} · {formatSize(f.size)}</div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-xs px-2 py-0.5 rounded',
                        f.configured ? 'text-green-600 dark:text-green-400 bg-green-500/10' : 'text-muted-foreground'
                      )}
                    >
                      {f.configured ? '已配置' : '未配置'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 编辑弹窗 */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background w-full max-w-2xl max-h-[85vh] rounded-xl border border-border flex flex-col shadow-xl">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-medium">{editingFile.title}</h3>
              <div className="flex items-center gap-3">
                {SHOW_SIMPLE_MODE && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn('text-muted-foreground', editMode === 'simple' && 'text-foreground font-medium')}>普通模式</span>
                    <Switch
                      checked={editMode === 'raw'}
                      onCheckedChange={(v) => {
                        if (v) {
                          const fileKey = FILE_KEY_MAP[editingFile.file] || editingFile.file.replace('.md', '')
                          window.electronAPI?.persona?.getFile({ agentId: selectedAgentId, file: fileKey }).then((res) => {
                            if (res.success && res.content != null) {
                              setEditContent(res.content)
                            }
                          })
                          setEditMode('raw')
                        } else {
                          if (editingFile.file === 'IDENTITY.md') {
                            setSimpleForm({ identity: { name: parseMdField(editContent, ['名称', 'Name']), creature: parseMdField(editContent, ['角色类型', 'Creature']), vibe: parseMdField(editContent, ['风格', 'Vibe']), emoji: parseMdField(editContent, ['表情符号', 'Emoji']), avatar: parseMdField(editContent, ['头像', 'Avatar']) } })
                          } else if (editingFile.file === 'USER.md') {
                            setSimpleForm({ user: { name: parseMdField(editContent, ['姓名', 'Name']), preferredAddress: parseMdField(editContent, ['称呼偏好', 'Preferred address', 'Preferred Address']), notes: parseMdField(editContent, ['备注', 'Notes']) } })
                          } else if (editingFile.file === 'SOUL.md') {
                            setSimpleForm({ soul: editContent })
                          }
                          setEditMode('simple')
                        }
                      }}
                    />
                    <span className={cn('text-muted-foreground', editMode === 'raw' && 'text-foreground font-medium')}>原始文件</span>
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-7 px-2.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存
                </button>
                <button
                  onClick={closeEditor}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-[360px] overflow-y-auto p-4">
              {(!SHOW_SIMPLE_MODE || editMode === 'raw') ? (
                <div className="min-h-[320px]">
                  <p className="text-xs text-muted-foreground mb-2">直接编辑 Markdown 源文件，适合熟悉格式的用户</p>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-h-[300px] font-mono text-sm leading-normal rounded-lg border border-input bg-background px-4 py-5"
                    placeholder={`编辑 ${editingFile.file}...`}
                  />
                </div>
              ) : editingFile.file === 'IDENTITY.md' && simpleForm.identity ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">{SIMPLE_HINTS[editingFile.file]}</p>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">名称</label>
                    <Input value={simpleForm.identity.name} onChange={(e) => setSimpleForm((s) => ({ ...s, identity: { ...(s.identity ?? {}), name: e.target.value } }))} className="mt-0.5" placeholder="如：小助手" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">角色类型</label>
                    <Input value={simpleForm.identity.creature} onChange={(e) => setSimpleForm((s) => ({ ...s, identity: { ...(s.identity ?? {}), creature: e.target.value } }))} placeholder="如：AI 助手" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">风格</label>
                    <Input value={simpleForm.identity.vibe} onChange={(e) => setSimpleForm((s) => ({ ...s, identity: { ...(s.identity ?? {}), vibe: e.target.value } }))} placeholder="如：友好、专业" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">表情符号</label>
                    <Input value={simpleForm.identity.emoji} onChange={(e) => setSimpleForm((s) => ({ ...s, identity: { ...(s.identity ?? {}), emoji: e.target.value } }))} placeholder="如：🤖" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">头像路径</label>
                    <Input value={simpleForm.identity.avatar} onChange={(e) => setSimpleForm((s) => ({ ...s, identity: { ...(s.identity ?? {}), avatar: e.target.value } }))} placeholder="如：avatars/xxx.png" />
                  </div>
                </div>
              ) : editingFile.file === 'USER.md' && simpleForm.user ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">{SIMPLE_HINTS[editingFile.file]}</p>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">你的姓名</label>
                    <Input value={simpleForm.user.name} onChange={(e) => setSimpleForm((s) => ({ ...s, user: { ...(s.user ?? {}), name: e.target.value } }))} placeholder="智能体如何称呼你" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">称呼偏好</label>
                    <Input value={simpleForm.user.preferredAddress} onChange={(e) => setSimpleForm((s) => ({ ...s, user: { ...(s.user ?? {}), preferredAddress: e.target.value } }))} placeholder="如：你、您" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">备注</label>
                    <textarea value={simpleForm.user.notes} onChange={(e) => setSimpleForm((s) => ({ ...s, user: { ...(s.user ?? {}), notes: e.target.value } }))} placeholder="其他需要智能体了解的信息" className="w-full min-h-[80px] font-mono text-sm leading-normal rounded-lg border border-input bg-background px-4 py-5" />
                  </div>
                </div>
              ) : (
                <div className="min-h-[320px]">
                  <p className="text-xs text-muted-foreground mb-2">{SIMPLE_HINTS[editingFile.file]}</p>
                  <textarea
                    value={editingFile.file === 'SOUL.md' ? simpleForm.soul ?? editContent : editContent}
                    onChange={(e) => editingFile.file === 'SOUL.md' ? setSimpleForm((s) => ({ ...s, soul: e.target.value })) : setEditContent(e.target.value)}
                    className="w-full min-h-[300px] font-mono text-sm leading-normal rounded-lg border border-input bg-background px-4 py-5"
                    placeholder={SIMPLE_HINTS[editingFile.file]}
                  />
                </div>
              )}
            </div>
            {editingFilePath && (
              <div className="shrink-0 px-4 py-2 border-t border-border">
                <p className="text-xs text-muted-foreground font-mono truncate" title={editingFilePath}>
                  {editingFilePath}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
