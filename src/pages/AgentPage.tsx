import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Bot, Loader2, RefreshCw, MessageSquare, Upload, X } from 'lucide-react'
import ChatPanel from '@/components/chat/ChatPanel'
import { AgentAvatar, toMediaReadableUrl } from '@/components/AgentAvatar'
import { useGateway } from '@/contexts/GatewayContext'
import { useAgentContext, type AgentTab } from '@/contexts/AgentContext'
import { useAppearance } from '@/contexts/AppearanceContext'

// AgentInfo 在 global.d.ts 中声明，这里本地引用
type AgentInfo = {
  id: string
  name: string
  identity?: { name?: string; emoji?: string; avatar?: string }
}

/** 设置弹窗内的头像预览（支持 media://、workspace:agentId:path、http、data:） */
function SettingsAvatarPreview({ url, agentId }: { url: string; agentId?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const readUrl = url && agentId ? toMediaReadableUrl(url, agentId) : url
  useEffect(() => {
    if (!readUrl) return
    if (readUrl.startsWith('http') || readUrl.startsWith('data:')) {
      setDataUrl(readUrl)
      return
    }
    let cancelled = false
    window.electronAPI?.media?.readFile(readUrl).then(res => {
      if (!cancelled && res.success && res.dataUrl) setDataUrl(res.dataUrl)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [readUrl])
  if (!dataUrl) return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  return <img src={dataUrl} alt="" className="w-full h-full object-cover" />
}

/** 从 config 解析 agent 的模型（agents.list[].model 或 agents.defaults.model） */
function resolveAgentModel(config: Record<string, unknown>, agentId: string): string {
  const agents = config.agents as Record<string, unknown> | undefined
  const list = Array.isArray(agents?.list) ? agents.list : []
  const entry = list.find((a: { id?: string }) => String(a?.id) === agentId) as { model?: string | { primary?: string } } | undefined
  if (entry?.model) {
    if (typeof entry.model === 'string' && entry.model.trim()) return entry.model.trim()
    if (typeof entry.model === 'object' && entry.model.primary) return String(entry.model.primary).trim()
  }
  const defaults = agents?.defaults as Record<string, unknown> | undefined
  const raw = defaults?.model
  if (typeof raw === 'string') return raw.trim()
  return (raw as { primary?: string })?.primary?.trim() || ''
}

interface AgentPageProps {
  onNavigateToModels?: () => void
  configVersion?: number
}

export default function AgentPage({ onNavigateToModels, configVersion }: AgentPageProps) {
  const { status: gatewayStatus, initializing: gatewayInitializing } = useGateway()
  const agentCtx = useAgentContext()
  const { appName, iconDataUrl } = useAppearance()
  const agents = agentCtx?.agents ?? []
  const activeAgentId = agentCtx?.activeAgentId ?? null
  const setAgents = agentCtx?.setAgents ?? (() => {})
  const setActiveAgentId = agentCtx?.setActiveAgentId ?? (() => {})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDialogName, setCreateDialogName] = useState('')
  const [createDialogCode, setCreateDialogCode] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<AgentTab | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [settingsAgent, setSettingsAgent] = useState<AgentTab | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsEmoji, setSettingsEmoji] = useState('')
  const [settingsAvatar, setSettingsAvatar] = useState<string | null>(null)
  const [settingsAvatarUploading, setSettingsAvatarUploading] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // 每个 agent 的模型（用于 ChatPanel 初始值）
  const [agentModels, setAgentModels] = useState<Record<string, string>>({})
  // 当前 agent 的 Gateway 会话列表
  const [gatewaySessions, setGatewaySessions] = useState<Array<{ key: string; label?: string; derivedTitle?: string; lastMessagePreview?: string; updatedAt?: number }>>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  // 当前选中的 sessionKey（agent:agentId:xxx）
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null)
  // 每个 agent 上次激活的 sessionKey，切换回来时恢复
  const agentSessionMapRef = useRef<Record<string, string>>({})
  const prevAgentIdRef = useRef<string | null>(null)
  const activeSessionKeyRef = useRef<string | null>(null)
  activeSessionKeyRef.current = activeSessionKey
  const activeAgentIdRef = useRef<string | null>(null)
  activeAgentIdRef.current = activeAgentId
  const [contextMenuAgent, setContextMenuAgent] = useState<AgentTab | null>(null)
  const [contextMenuAnchor, setContextMenuAnchor] = useState({ left: 0, top: 0 })
  const contextMenuRef = useRef<HTMLDivElement>(null)
  // 每个 agent 隐藏的 session（不在顶部 tab 展示），持久化到 ~/.openclaw/yunyaClaw.json
  const [hiddenSessionKeys, setHiddenSessionKeys] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!window.electronAPI?.prefs?.getHiddenSessions) return
    window.electronAPI.prefs.getHiddenSessions().then(data => {
      if (data && typeof data === 'object') setHiddenSessionKeys(data)
    }).catch(() => {})
  }, [])
  const [sessionListOpen, setSessionListOpen] = useState(false)
  const [sessionListAnchor, setSessionListAnchor] = useState({ left: 0, top: 0 })
  const sessionListRef = useRef<HTMLDivElement>(null)
  const sessionListButtonRef = useRef<HTMLButtonElement>(null)
  const [sessionContextMenu, setSessionContextMenu] = useState<{ key: string; left: number; top: number; source: 'topbar' | 'list' } | null>(null)
  const sessionContextMenuRef = useRef<HTMLDivElement>(null)
  const [renameModal, setRenameModal] = useState<{ sessionKey: string; currentTitle: string } | null>(null)
  const [renameInput, setRenameInput] = useState('')

  const formatSessionTime = (s: { key: string; updatedAt?: number }) => {
    if (s.updatedAt && s.updatedAt > 0) {
      const d = new Date(s.updatedAt)
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }
    const m = /session-(\d+)/i.exec(s.key)
    if (m) {
      const d = new Date(parseInt(m[1], 10))
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }
    return '-'
  }

  const loadAgents = useCallback(async (retry = 3) => {
    if (!window.electronAPI) return
    setLoading(true)
    try {
      const result = await window.electronAPI.agents.list()
      console.log('[AgentPage] agents.list result:', JSON.stringify(result))
      if (result.success && result.data) {
        // payload 可能直接是 agents 数组，也可能包含 agents 字段
        const raw = result.data as unknown as Record<string, unknown>
        const agentsList = Array.isArray(raw.agents) ? (raw.agents as AgentInfo[]) :
                           Array.isArray(raw) ? (raw as unknown as AgentInfo[]) : []
        let list: AgentTab[] = agentsList.map((a: AgentInfo) => ({
          id: a.id,
          name: a.id === 'main' ? appName : (a.identity?.name || a.name || a.id),
          emoji: a.id === 'main' ? undefined : (a.identity?.emoji || undefined),
          avatar: a.identity?.avatar || undefined,
        }))
        // RPC 返回空时 fallback 到 main，避免界面空白
        if (list.length === 0) {
          list = [{ id: 'main', name: appName, emoji: undefined, avatar: undefined }]
        }
        setAgents(list)
        const currentActiveId = activeAgentIdRef.current
        if (list.length > 0 && (!currentActiveId || !list.find(a => a.id === currentActiveId))) {
          const defaultId = typeof raw.defaultId === 'string' ? raw.defaultId : undefined
          setActiveAgentId(defaultId || list[0].id)
        }
      } else if (!result.success && retry > 0) {
        // RPC 失败时重试
        console.warn('[AgentPage] agents.list 失败，重试...', result.error)
        setTimeout(() => loadAgents(retry - 1), 1500)
        return
      }
    } catch (err) {
      console.error('加载 agents 失败:', err)
      if (retry > 0) {
        setTimeout(() => loadAgents(retry - 1), 1500)
        return
      }
    }
    setLoading(false)
  }, [appName])

  useEffect(() => {
    if (gatewayStatus === 'running') {
      loadAgents()
    }
  }, [gatewayStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // 页面重新可见时，仅当 agents 尚未加载成功时重试，避免首次加载失败导致空白；已加载则不再刷新，防止页面抖动
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && gatewayStatus === 'running' && agents.length === 0) {
        loadAgents()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [gatewayStatus, agents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // appName 加载后更新 main 数字人显示名称
  useEffect(() => {
    if (agents.some(a => a.id === 'main')) {
      setAgents(prev => prev.map(a => a.id === 'main' ? { ...a, name: appName } : a))
    }
  }, [appName])

  // 加载各 agent 的模型（用于 ChatPanel 初始值）
  const loadConfigModels = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const config = await window.electronAPI.config.read()
      const agentsList = agents.length > 0 ? agents : [{ id: 'main', name: appName }]
      const map: Record<string, string> = {}
      for (const a of agentsList) {
        map[a.id] = resolveAgentModel(config, a.id)
      }
      setAgentModels(map)
    } catch (err) {
      console.error('加载配置模型失败:', err)
    }
  }, [agents])

  useEffect(() => {
    if (gatewayStatus === 'running' && agents.length > 0) {
      loadConfigModels()
    }
  }, [gatewayStatus, agents, loadConfigModels])

  const handleAgentModelChange = useCallback((agentId: string, modelFullId: string) => {
    setAgentModels(prev => ({ ...prev, [agentId]: modelFullId }))
  }, [])

  const mainSessionKey = activeAgentId ? `agent:${activeAgentId}:main` : null

  const loadGatewaySessions = useCallback(async (agentId: string) => {
    if (!window.electronAPI?.chat?.listGatewaySessions) return
    setSessionsLoading(true)
    try {
      const res = await window.electronAPI.chat.listGatewaySessions(agentId)
      const mainKey = `agent:${agentId}:main`
      if (res.success && res.sessions && res.sessions.length > 0) {
        setGatewaySessions(res.sessions)
        const saved = agentSessionMapRef.current[agentId]
        const toRestore = saved && res.sessions!.some(s => s.key.toLowerCase() === saved.toLowerCase())
          ? saved
          : mainKey
        setActiveSessionKey(toRestore)
        agentSessionMapRef.current[agentId] = toRestore
      } else {
        setGatewaySessions([])
        setActiveSessionKey(mainKey)
      }
    } catch {
      setGatewaySessions([])
      setActiveSessionKey(`agent:${agentId}:main`)
    }
    setSessionsLoading(false)
  }, [])

  /** 刷新整个 chat 页面：数字人列表、会话列表、模型配置等 */
  const handleRefresh = useCallback(async () => {
    await loadAgents()
    if (activeAgentId) loadGatewaySessions(activeAgentId)
    loadConfigModels()
  }, [loadAgents, loadGatewaySessions, loadConfigModels, activeAgentId])

  useEffect(() => {
    if (activeAgentId && gatewayStatus === 'running') {
      const prev = prevAgentIdRef.current
      if (prev && prev !== activeAgentId) {
        const cur = activeSessionKeyRef.current
        if (cur && cur.toLowerCase().startsWith(`agent:${prev.toLowerCase()}:`)) {
          agentSessionMapRef.current[prev] = cur
        }
      }
      prevAgentIdRef.current = activeAgentId
      // 立即恢复 sessionKey，避免用旧 agent 的 sessionKey 渲染导致闪动
      const mainKey = `agent:${activeAgentId}:main`
      const cached = agentSessionMapRef.current[activeAgentId]
      const initialKey = cached && cached.toLowerCase().startsWith(`agent:${activeAgentId.toLowerCase()}:`)
        ? cached
        : mainKey
      setActiveSessionKey(initialKey)
      loadGatewaySessions(activeAgentId)
    } else {
      setGatewaySessions([])
      setActiveSessionKey(activeAgentId ? `agent:${activeAgentId}:main` : null)
    }
  }, [activeAgentId, gatewayStatus, loadGatewaySessions])

  /** 监听外部渠道（如微信、钉钉）触发的对话刷新事件 */
  useEffect(() => {
    if (!window.electronAPI?.gateway?.onChatRefresh) return
    const unsubscribe = window.electronAPI.gateway.onChatRefresh((_data) => {
      // 刷新当前 agent 的会话列表
      if (activeAgentId) {
        loadGatewaySessions(activeAgentId)
      }
    })
    return unsubscribe
  }, [activeAgentId, loadGatewaySessions])

  const handleNewSession = useCallback(() => {
    if (!activeAgentId) return
    const newKey = `agent:${activeAgentId}:session-${Date.now()}`
    setGatewaySessions(prev => [{ key: newKey, updatedAt: Date.now() }, ...prev])
    setActiveSessionKey(newKey)
    agentSessionMapRef.current[activeAgentId] = newKey
  }, [activeAgentId])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuAgent(null)
      }
    }
    if (contextMenuAgent) {
      document.addEventListener('mousedown', onOutside)
      return () => document.removeEventListener('mousedown', onOutside)
    }
  }, [contextMenuAgent])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (sessionListRef.current && !sessionListRef.current.contains(e.target as Node) &&
          sessionListButtonRef.current && !sessionListButtonRef.current.contains(e.target as Node)) {
        setSessionListOpen(false)
      }
      if (sessionContextMenuRef.current && !sessionContextMenuRef.current.contains(e.target as Node)) {
        setSessionContextMenu(null)
      }
    }
    if (sessionListOpen || sessionContextMenu) {
      document.addEventListener('mousedown', onOutside)
      return () => document.removeEventListener('mousedown', onOutside)
    }
  }, [sessionListOpen, sessionContextMenu])

  const persistHiddenSessions = useCallback((data: Record<string, string[]>) => {
    window.electronAPI?.prefs?.setHiddenSessions(data)?.catch(() => {})
  }, [])

  const hideSession = useCallback((agentId: string, sessionKey: string) => {
    setHiddenSessionKeys(prev => {
      const arr = prev[agentId] || []
      if (arr.includes(sessionKey)) return prev
      const next = { ...prev, [agentId]: [...arr, sessionKey] }
      persistHiddenSessions(next)
      return next
    })
    setSessionContextMenu(null)
  }, [persistHiddenSessions])

  const unhideSession = useCallback((agentId: string, sessionKey: string) => {
    setHiddenSessionKeys(prev => {
      const arr = (prev[agentId] || []).filter(k => k !== sessionKey)
      const next = arr.length === 0 ? (() => { const n = { ...prev }; delete n[agentId]; return n })() : { ...prev, [agentId]: arr }
      persistHiddenSessions(next)
      return next
    })
    setSessionContextMenu(null)
  }, [persistHiddenSessions])

  const openRenameModal = useCallback((sessionKey: string, currentTitle: string) => {
    setSessionContextMenu(null)
    setRenameModal({ sessionKey, currentTitle })
    setRenameInput(currentTitle)
  }, [])

  const closeRenameModal = useCallback(() => {
    setRenameModal(null)
    setRenameInput('')
  }, [])

  const submitRename = useCallback(async () => {
    if (!renameModal || !renameInput.trim()) return
    const newName = renameInput.trim()
    if (newName === renameModal.currentTitle) {
      closeRenameModal()
      return
    }
    try {
      const res = await window.electronAPI.chat.patchGatewaySession(renameModal.sessionKey, newName)
      if (res.success && activeAgentId) {
        loadGatewaySessions(activeAgentId)
      } else {
        console.error('修改会话名称失败:', res.error)
      }
    } catch (err) {
      console.error('修改会话名称失败:', err)
    }
    closeRenameModal()
  }, [renameModal, renameInput, activeAgentId, loadGatewaySessions, closeRenameModal])

  const openCreateDialog = useCallback(() => {
    const num = agents.length + 1
    setCreateDialogName(`数字人 ${num}`)
    setCreateDialogCode('')
    setCreateError(null)
    setCreateDialogOpen(true)
  }, [agents.length])

  const createAgent = useCallback(async () => {
    if (!window.electronAPI || creating) return
    const name = createDialogName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const result = await window.electronAPI.agents.create({
        name,
        ...(createDialogCode.trim() ? { code: createDialogCode.trim() } : {}),
        emoji: '🤖',
      })
      if (result.success && result.data) {
        const newAgent: AgentTab = {
          id: result.data.agentId,
          name: name,
          emoji: '🤖',
        }
        setAgents(prev => [...prev, newAgent])
        setActiveAgentId(newAgent.id)
        setCreateDialogOpen(false)
      } else if (!result.success && result.error) {
        const errMsg = result.error
        setCreateError(
          /already exists|已存在/i.test(errMsg)
            ? '目录名已存在，请更换其他 code'
            : errMsg
        )
      }
    } catch (err) {
      const errMsg = String(err)
      setCreateError(
        /already exists|已存在/i.test(errMsg)
          ? '目录名已存在，请更换其他 code'
          : errMsg
      )
    }
    setCreating(false)
  }, [creating, createDialogName, createDialogCode])

  const closeCreateDialog = useCallback(() => {
    if (!creating) {
      setCreateDialogOpen(false)
      setCreateError(null)
    }
  }, [creating])

  const openDeleteConfirm = useCallback((agent: AgentTab) => {
    setDeleteConfirmAgent(agent)
    setDeleteConfirmInput('')
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmAgent(null)
    setDeleteConfirmInput('')
  }, [])

  const deleteAgent = useCallback(async (agentId: string) => {
    if (!window.electronAPI || agents.length <= 1 || deletingAgentId) return
    if (agentId === 'main') return // main 不可删除

    setDeletingAgentId(agentId)
    try {
      const result = await window.electronAPI.agents.delete(agentId)
      if (result.success) {
        setAgents(prev => {
          const filtered = prev.filter(a => a.id !== agentId)
          if (activeAgentId === agentId) {
            setActiveAgentId(filtered[0]?.id || null)
          }
          return filtered
        })
        // 同时删除本地消息记录
        await window.electronAPI.chat.deleteSession(agentId)
        closeDeleteConfirm()
      }
    } catch (err) {
      console.error('删除 agent 失败:', err)
    } finally {
      setDeletingAgentId(null)
    }
  }, [agents.length, activeAgentId, closeDeleteConfirm, deletingAgentId])

  const openSettings = useCallback((agent: AgentTab) => {
    setSettingsAgent(agent)
    setSettingsName(agent.name)
    setSettingsEmoji(agent.emoji || '')
    setSettingsAvatar(agent.avatar || null)
    setSettingsError(null)
  }, [])

  const closeSettings = useCallback(() => {
    if (!settingsSaving) {
      setSettingsAgent(null)
      setSettingsError(null)
    }
  }, [settingsSaving])

  const saveSettings = useCallback(async () => {
    if (!settingsAgent || settingsSaving) return
    const newName = settingsName.trim()
    if (!newName) {
      setSettingsError('名称不能为空')
      return
    }
    setSettingsSaving(true)
    setSettingsError(null)
    const prevAgent = { ...settingsAgent }
    setAgents(prev => prev.map(a => a.id === settingsAgent.id ? { ...a, name: newName, emoji: settingsEmoji || undefined, avatar: settingsAvatar || undefined } : a))
    try {
      if (newName !== settingsAgent.name) {
        const result = await window.electronAPI.agents.rename({ agentId: settingsAgent.id, newName })
        if (!result.success) {
          setAgents(prev => prev.map(a => a.id === settingsAgent.id ? { ...a, name: prevAgent.name } : a))
          throw new Error(result.error)
        }
      }
      if (settingsEmoji !== (settingsAgent.emoji || '')) {
        const res = await window.electronAPI.persona.saveSimple({
          agentId: settingsAgent.id,
          identity: { emoji: settingsEmoji || undefined },
        })
        if (!res.success) {
          setAgents(prev => prev.map(a => a.id === settingsAgent.id ? { ...a, emoji: prevAgent.emoji } : a))
          throw new Error(res.error)
        }
        const cfgRes = await window.electronAPI.config.saveAgentIdentity(settingsAgent.id, { emoji: settingsEmoji || undefined })
        if (!cfgRes.success) {
          setAgents(prev => prev.map(a => a.id === settingsAgent.id ? { ...a, emoji: prevAgent.emoji } : a))
          throw new Error(cfgRes.error)
        }
      }
      if (settingsAvatar !== (settingsAgent.avatar || null)) {
        const avatarToSave = settingsAvatar ?? ''
        const cfgRes = await window.electronAPI.config.saveAgentIdentity(settingsAgent.id, { avatar: avatarToSave })
        if (!cfgRes.success) {
          setAgents(prev => prev.map(a => a.id === settingsAgent.id ? { ...a, avatar: prevAgent.avatar } : a))
          throw new Error(cfgRes.error)
        }
      }
      setSettingsAgent(null)
    } catch (err) {
      setSettingsError(String(err))
    } finally {
      setSettingsSaving(false)
    }
  }, [settingsAgent, settingsName, settingsEmoji, settingsAvatar, settingsSaving])

  const handleSessionUpdated = useCallback((_session: { id: string; title?: string }) => {
    // 刷新 Gateway 会话列表，获取 derivedTitle（Openclaw 从首条用户消息推导），使 tab 名称实时更新
    if (activeAgentId) loadGatewaySessions(activeAgentId)
  }, [activeAgentId, loadGatewaySessions])

  if (gatewayStatus !== 'running') {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">
            {gatewayStatus === 'starting' ? (gatewayInitializing ? '应用初始化中...' : '应用启动中...') : '应用已停止，请到控制台重新启动'}
          </p>
          {gatewayStatus === 'starting' && (
            <Loader2 className="w-5 h-5 mx-auto mt-3 animate-spin text-muted-foreground/50" />
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 新建数字人弹窗 */}
      {createDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeCreateDialog}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-medium">新建数字人</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">显示名称</label>
                <input
                  value={createDialogName}
                  onChange={e => setCreateDialogName(e.target.value)}
                  placeholder="如：小说家"
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Agent 目录名</label>
                <input
                  value={createDialogCode}
                  onChange={e => { setCreateDialogCode(e.target.value); setCreateError(null) }}
                  placeholder="如 code、novelist，留空则从名称推导"
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                  onKeyDown={e => {
                    if (e.key === 'Enter') createAgent()
                    if (e.key === 'Escape') closeCreateDialog()
                  }}
                />
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateDialog}
                disabled={creating}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={createAgent}
                disabled={creating || !createDialogName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? <Loader2 className="inline h-4 w-4 animate-spin" /> : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeDeleteConfirm}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-medium text-destructive">删除数字人</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              确定要删除「{deleteConfirmAgent.name}」吗？此操作不可恢复。
            </p>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-muted-foreground">
                请输入「确认删除{deleteConfirmAgent.name}」以确认
              </label>
              <input
                value={deleteConfirmInput}
                onChange={e => setDeleteConfirmInput(e.target.value)}
                placeholder={`确认删除${deleteConfirmAgent.name}`}
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                onKeyDown={e => {
                  if (e.key === 'Enter' && deleteConfirmInput === `确认删除${deleteConfirmAgent.name}`) {
                    deleteAgent(deleteConfirmAgent.id)
                  }
                  if (e.key === 'Escape') closeDeleteConfirm()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={!!deletingAgentId}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => deleteAgent(deleteConfirmAgent.id)}
                disabled={deleteConfirmInput !== `确认删除${deleteConfirmAgent.name}` || !!deletingAgentId}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deletingAgentId ? <Loader2 className="inline h-4 w-4 animate-spin" /> : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主区域：左侧（会话+对话）+ 右侧数字人 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：会话栏 + 对话区 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 会话列表：tab 少时按钮紧跟 tab，tab 多时按钮 sticky 吸在右侧，无抖动 */}
          <div className="flex items-center border-b border-border bg-[#0d0d0d] shrink-0 overflow-x-auto scrollbar-thin min-h-0">
            <div className="flex items-center gap-1 px-2 py-2 shrink-0">
            <button
                ref={sessionListButtonRef}
                type="button"
                onClick={() => {
                  const rect = sessionListButtonRef.current?.getBoundingClientRect()
                  if (rect) setSessionListAnchor({ left: rect.left, top: rect.bottom + 4 })
                  setSessionListOpen(v => !v)
                }}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
                title="会话列表"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              {sessionListOpen && (
                <div
                  ref={sessionListRef}
                  className="fixed z-50 py-1 bg-background border border-border rounded-lg shadow-xl min-w-[200px] max-h-[320px] overflow-y-auto"
                  style={{ left: sessionListAnchor.left, top: sessionListAnchor.top }}
                >
                  {sessionsLoading ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">加载中...</div>
                  ) : (
                    (gatewaySessions.length > 0 ? gatewaySessions : mainSessionKey ? [{ key: mainSessionKey, updatedAt: Date.now() }] : []).map(s => {
                      const isMain = s.key.toLowerCase().endsWith(':main')
                      const title = s.label || s.derivedTitle || (isMain ? '主会话' : s.key.split(':').pop() || '会话')
                      const isActive = activeSessionKey?.toLowerCase() === s.key.toLowerCase()
                      const isHidden = activeAgentId && (hiddenSessionKeys[activeAgentId] || []).includes(s.key)
                      return (
                        <div
                          key={s.key}
                          className="relative group"
                          onContextMenu={e => {
                            e.preventDefault()
                            setSessionContextMenu({ key: s.key, left: e.clientX, top: e.clientY, source: 'list' })
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSessionKey(s.key)
                              if (activeAgentId) agentSessionMapRef.current[activeAgentId] = s.key
                              setSessionListOpen(false)
                            }}
                            className={cn(
                              'w-full flex flex-col items-stretch gap-0.5 px-3 py-2 text-xs text-left transition-colors',
                              isActive ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50',
                              isHidden && 'opacity-60'
                            )}
                          >
                            <span className="truncate" title={s.lastMessagePreview || title}>{title}</span>
                            <span className="text-[10px] text-muted-foreground/80">{formatSessionTime(s)}{isHidden ? ' · 已隐藏' : ''}</span>
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
              {sessionsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
              ) : (
                (() => {
                  const allSessions = gatewaySessions.length > 0 ? gatewaySessions : mainSessionKey ? [{ key: mainSessionKey, updatedAt: Date.now() }] : []
                  const hidden = activeAgentId ? (hiddenSessionKeys[activeAgentId] || []) : []
                  const visibleSessions = allSessions.filter(s => !hidden.includes(s.key))
                  return visibleSessions.map(s => {
                    const isMain = s.key.toLowerCase().endsWith(':main')
                    const title = s.label || s.derivedTitle || (isMain ? '主会话' : s.key.split(':').pop() || '会话')
                    const isActive = activeSessionKey?.toLowerCase() === s.key.toLowerCase()
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => {
                          setActiveSessionKey(s.key)
                          if (activeAgentId) agentSessionMapRef.current[activeAgentId] = s.key
                        }}
                        onContextMenu={e => {
                          e.preventDefault()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setSessionContextMenu({ key: s.key, left: rect.left, top: rect.bottom, source: 'topbar' })
                        }}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs shrink-0 transition-colors',
                          isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        )}
                      >
                        <span className="max-w-[140px] truncate" title={s.lastMessagePreview || title}>{title}</span>
                      </button>
                    )
                  })
                })()
              )}
              </div>
            {/* + 和刷新：tab 少时紧跟 tab，超长时 sticky 吸在右侧 */}
            <div className="sticky right-0 flex items-center gap-0.5 pl-1 pr-2 py-2 shrink-0 bg-[#0d0d0d]">
              <button
                onClick={handleNewSession}
                disabled={!activeAgentId}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40"
                title="新会话"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40"
                title="刷新页面"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 会话右键菜单（修改名称 / 隐藏/显示） */}
          {sessionContextMenu && activeAgentId && (
            <div
              ref={sessionContextMenuRef}
              className="fixed z-[60] py-1 bg-background border border-border rounded-lg shadow-lg min-w-[120px]"
              style={{ left: sessionContextMenu.left, top: sessionContextMenu.top }}
            >
              <button
                type="button"
                onClick={() => {
                  const allSessions = gatewaySessions.length > 0 ? gatewaySessions : mainSessionKey ? [{ key: mainSessionKey, updatedAt: Date.now() }] : []
                  const sess = allSessions.find(x => x.key === sessionContextMenu.key)
                  const isMain = sessionContextMenu.key.toLowerCase().endsWith(':main')
                  const title = sess?.label || sess?.derivedTitle || (isMain ? '主会话' : sessionContextMenu.key.split(':').pop() || '会话')
                  openRenameModal(sessionContextMenu.key, title)
                }}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
              >
                修改名称
              </button>
              {sessionContextMenu.source === 'list' && activeAgentId && (hiddenSessionKeys[activeAgentId] || []).includes(sessionContextMenu.key) && (
                <button
                  type="button"
                  onClick={() => {
                    unhideSession(activeAgentId, sessionContextMenu.key)
                    setActiveSessionKey(sessionContextMenu.key)
                    if (activeAgentId) agentSessionMapRef.current[activeAgentId] = sessionContextMenu.key
                    setSessionListOpen(false)
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
                >
                  显示会话
                </button>
              )}
              {sessionContextMenu.source === 'topbar' && (
                (hiddenSessionKeys[activeAgentId] || []).includes(sessionContextMenu.key) ? (
                  <button
                    type="button"
                    onClick={() => unhideSession(activeAgentId, sessionContextMenu.key)}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
                  >
                    显示在顶部
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => hideSession(activeAgentId, sessionContextMenu.key)}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
                  >
                    隐藏会话
                  </button>
                )
              )}
            </div>
          )}

          {/* 修改会话名称弹窗 */}
          {renameModal && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
              onClick={closeRenameModal}
            >
              <div
                className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="mb-3 text-sm font-medium">修改会话名称</h3>
                <input
                  value={renameInput}
                  onChange={e => setRenameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitRename()
                    if (e.key === 'Escape') closeRenameModal()
                  }}
                  placeholder="输入新名称"
                  className="mb-4 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeRenameModal}
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submitRename}
                    disabled={!renameInput.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 对话区 */}
          {activeAgentId && activeSessionKey && (
            <ChatPanel
              key={`${activeAgentId}:${activeSessionKey}`}
              sessionKey={activeSessionKey}
              agentId={activeAgentId}
              agentModel={agentModels[activeAgentId] || ''}
              onAgentModelChange={handleAgentModelChange}
              onSessionUpdated={handleSessionUpdated}
              onNavigateToModels={onNavigateToModels}
              configVersion={configVersion}
            />
          )}
        </div>

        {/* 右侧：数字人大图标竖向悬浮（从顶部开始，会话属于数字人） */}
        <div className="w-14 shrink-0 flex flex-col items-center pt-2 pr-2">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-background/80 backdrop-blur-sm shadow-lg p-2">
            {agents.map(a => (
              <div key={a.id} className="relative">
                <button
                  type="button"
                  onClick={() => setActiveAgentId(a.id)}
                  onContextMenu={e => {
                    e.preventDefault()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setContextMenuAgent(a)
                    setContextMenuAnchor({ left: rect.left, top: rect.top })
                  }}
                  title={`${a.name}${a.id !== 'main' ? ` (${a.id})` : ''}`}
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center text-2xl transition-all shrink-0 shadow-sm overflow-hidden',
                    activeAgentId === a.id
                      ? 'bg-primary/25 ring-1 ring-primary/50'
                      : 'bg-muted/20 hover:bg-muted/40'
                  )}
                >
                  <AgentAvatar
                    avatar={a.avatar}
                    agentId={a.id}
                    emoji={a.emoji}
                    isMain={a.id === 'main'}
                    iconDataUrl={iconDataUrl}
                    className="shrink-0"
                  />
                </button>
              </div>
            ))}
            <button
              onClick={openCreateDialog}
              disabled={creating}
              className="w-11 h-11 rounded-xl flex items-center justify-center bg-muted/20 text-muted-foreground hover:bg-primary/20 hover:text-primary disabled:opacity-50 transition-colors shrink-0"
              title="新建数字人"
            >
              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
          </div>
          {contextMenuAgent && (
            <div
              ref={contextMenuRef}
              className="fixed z-50 py-1 bg-background border border-border rounded-lg shadow-lg min-w-[100px]"
              style={{
                left: Math.max(8, contextMenuAnchor.left - 120),
                top: contextMenuAnchor.top,
              }}
            >
              <button
                type="button"
                onClick={() => { openSettings(contextMenuAgent); setContextMenuAgent(null) }}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
              >
                设置
              </button>
              {contextMenuAgent.id !== 'main' && agents.length > 1 && (
                <button
                  type="button"
                  onClick={() => { openDeleteConfirm(contextMenuAgent); setContextMenuAgent(null) }}
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50 text-destructive"
                >
                  删除
                </button>
              )}
            </div>
          )}

      {/* 设置数字人浮层 */}
      {settingsAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeSettings}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-medium">设置数字人</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">名称</label>
                <input
                  value={settingsName}
                  onChange={e => { setSettingsName(e.target.value); setSettingsError(null) }}
                  placeholder="显示名称"
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveSettings()
                    if (e.key === 'Escape') closeSettings()
                  }}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">头像</label>
                <p className="text-xs text-muted-foreground mb-2">上传头像后以头像为准，不再展示 emoji</p>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {settingsAvatar ? (
                      <SettingsAvatarPreview url={settingsAvatar} agentId={settingsAgent?.id} />
                    ) : (
                      <span className="text-2xl">{settingsEmoji || '🤖'}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        disabled={settingsAvatarUploading || settingsSaving}
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (!file || !window.electronAPI?.agents?.saveAvatar || !settingsAgent) return
                          setSettingsAvatarUploading(true)
                          setSettingsError(null)
                          try {
                            const dataUrl = await new Promise<string>((resolve, reject) => {
                              const r = new FileReader()
                              r.onload = () => resolve(r.result as string)
                              r.onerror = reject
                              r.readAsDataURL(file)
                            })
                            const res = await window.electronAPI.agents.saveAvatar(settingsAgent.id, dataUrl)
                            if (res.success && res.avatarUrl) setSettingsAvatar(res.avatarUrl)
                            else setSettingsError(res.error || '上传失败')
                          } catch (err) {
                            setSettingsError(String(err))
                          } finally {
                            setSettingsAvatarUploading(false)
                            e.target.value = ''
                          }
                        }}
                      />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-sm">
                        {settingsAvatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        上传
                      </span>
                    </label>
                    {settingsAvatar && (
                      <button
                        type="button"
                        onClick={() => setSettingsAvatar(null)}
                        disabled={settingsSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                        清除头像
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Emoji（无头像时显示）</label>
                <div className="flex flex-wrap gap-2">
                  {['🤖', '🐱', '🐶', '🐼', '🦊', '🐧', '🐸', '🔥', '⭐', '📝', '🎨'].map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setSettingsEmoji(e)}
                      className={cn(
                        'w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors',
                        settingsEmoji === e ? 'bg-primary/30 ring-1 ring-primary' : 'bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  value={settingsEmoji}
                  onChange={e => setSettingsEmoji(e.target.value)}
                  placeholder="或输入 emoji"
                  className="mt-2 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              {settingsError && (
                <p className="text-sm text-destructive">{settingsError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSettings}
                disabled={settingsSaving}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={settingsSaving || !settingsName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {settingsSaving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
