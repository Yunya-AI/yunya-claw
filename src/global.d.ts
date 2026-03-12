interface SkillData {
  name: string
  description: string
  emoji?: string
  source: 'bundled' | 'managed' | 'workspace'
  enabled: boolean
  skillKey?: string
  requires?: Record<string, unknown>
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  createdAt: number
  updatedAt: number
}

interface ChatSessionMeta {
  id: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
}

interface AgentInfo {
  id: string
  name: string
  identity?: { name?: string; emoji?: string; avatar?: string }
}

interface AgentsListResult {
  agents: AgentInfo[]
  defaultId?: string
  mainKey?: string
}

interface ProviderSaveData {
  providerKey: string
  name: string
  apiKey: string
  baseUrl: string
  enabled: boolean
  models: Array<{
    id: string
    input?: ('text' | 'image' | 'document')[]
    contextWindow?: number
    reasoning?: boolean
  }>
  api: string
  website?: string
}

interface ElectronAPI {
  gateway: {
    start: () => Promise<{ success: boolean; port?: number }>
    stop: () => Promise<{ success: boolean }>
    status: () => Promise<{ running: boolean; port?: number }>
    token: () => Promise<string>
    onLog: (callback: (msg: string) => void) => () => void
    onError: (callback: (msg: string) => void) => () => void
    onStatus: (callback: (status: { running?: boolean; starting?: boolean; initializing?: boolean; code?: number; port?: number }) => void) => () => void
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  /** yunyaClaw.json 统一配置服务 */
  yunyaClaw: {
    read: () => Promise<Record<string, unknown>>
    get: (key: string) => Promise<unknown>
    update: (partial: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  }
  /** 应用外观：名称、图标 */
  appearance: {
    get: () => Promise<{ appName: string; hasCustomIcon: boolean }>
    getIconDataUrl: () => Promise<string | null>
    setAppName: (appName: string) => Promise<{ success: boolean; error?: string }>
    setIcon: (base64: string) => Promise<{ success: boolean; error?: string }>
    clearIcon: () => Promise<{ success: boolean; error?: string }>
  }
  prefs: {
    getHiddenSessions: () => Promise<Record<string, string[]>>
    setHiddenSessions: (data: Record<string, string[]>) => Promise<{ success: boolean; error?: string }>
  }
  config: {
    read: () => Promise<Record<string, unknown>>
    write: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    saveProviders: (
      providers: ProviderSaveData[],
      selectedModel?: { providerKey: string; modelId: string }
    ) => Promise<{ success: boolean; error?: string }>
    saveAgentModel: (agentId: string, model: string) => Promise<{ success: boolean; error?: string }>
    saveAgentIdentity: (agentId: string, identity: { name?: string; emoji?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>
  }
  chat: {
    listSessions: () => Promise<{ success: boolean; sessions: ChatSessionMeta[]; error?: string }>
    loadSession: (sessionId: string) => Promise<{ success: boolean; session?: ChatSession; error?: string }>
    saveSession: (session: ChatSession) => Promise<{ success: boolean; error?: string }>
    deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
    loadOpenClawTranscript: (sessionId: string) => Promise<{ success: boolean; messages?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>; error?: string }>
    resetSession: (agentId: string, reason?: 'new' | 'reset') => Promise<{ success: boolean; error?: string }>
    abort: (sessionKey: string, runId?: string) => Promise<{ success: boolean; error?: string }>
    listGatewaySessions: (agentId: string) => Promise<{ success: boolean; sessions?: Array<{ key: string; label?: string; derivedTitle?: string; lastMessagePreview?: string; updatedAt?: number }>; error?: string }>
    patchGatewaySession: (sessionKey: string, label: string) => Promise<{ success: boolean; error?: string }>
    resetGatewaySession: (sessionKey: string, reason?: 'new' | 'reset') => Promise<{ success: boolean; error?: string }>
  }
  media: {
    readFile: (mediaUrl: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
  }
  util: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
    saveImage: (imageUrl: string, suggestedName?: string) => Promise<{ success: boolean; canceled?: boolean; error?: string }>
  }
  agents: {
    list: () => Promise<{ success: boolean; data?: AgentsListResult; error?: string }>
    saveAvatar: (agentId: string, base64DataUrl: string) => Promise<{ success: boolean; avatarUrl?: string; error?: string }>
    create: (params: { name: string; emoji?: string }) => Promise<{ success: boolean; data?: { agentId: string; name: string }; error?: string }>
    delete: (agentId: string) => Promise<{ success: boolean; error?: string }>
    update: (params: { agentId: string; name?: string; model?: string }) => Promise<{ success: boolean; error?: string }>
    rename: (params: { agentId: string; newName: string }) => Promise<{ success: boolean; error?: string }>
  }
  persona: {
    getFiles: (agentId: string) => Promise<{
      success: boolean
      identity?: string
      soul?: string
      user?: string
      simple?: {
        identity: { name: string; creature: string; vibe: string; emoji: string; avatar: string }
        soul: string
        user: { name: string; preferredAddress: string; notes: string }
      }
      error?: string
    }>
    getWorkspacePath: (agentId: string) => Promise<{ success: boolean; path?: string; error?: string }>
    listFiles: (agentId: string) => Promise<{
      success: boolean
      files?: Array<{ file: string; title: string; desc: string; size: number; configured: boolean }>
      error?: string
    }>
    getFile: (params: { agentId: string; file: string }) => Promise<{ success: boolean; content?: string; error?: string }>
    saveFile: (params: { agentId: string; file: string; content: string }) => Promise<{ success: boolean; error?: string }>
    saveSimple: (params: {
      agentId: string
      identity?: { name?: string; creature?: string; vibe?: string; emoji?: string; avatar?: string }
      soul?: string
      user?: { name?: string; preferredAddress?: string; notes?: string }
    }) => Promise<{ success: boolean; error?: string }>
    saveRaw: (params: { agentId: string; file: string; content: string }) => Promise<{ success: boolean; error?: string }>
  }
  env: {
    read: () => Promise<{ success: boolean; entries: Array<{ key: string; value: string }>; error?: string }>
    write: (entries: Array<{ key: string; value: string }>) => Promise<{ success: boolean; error?: string }>
  }
  backup: {
    create: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>
    restore: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>
  }
  cron: {
    list: (params?: Record<string, unknown>) => Promise<{ success: boolean; data?: { jobs?: unknown[]; total?: number; hasMore?: boolean }; error?: string }>
    status: () => Promise<{ success: boolean; data?: { enabled?: boolean; jobs?: number; nextWakeAtMs?: number }; error?: string }>
    add: (params: Record<string, unknown>) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
    update: (params: { id?: string; jobId?: string; patch: Record<string, unknown> }) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
    remove: (params: { id?: string; jobId?: string }) => Promise<{ success: boolean; data?: { removed?: boolean }; error?: string }>
    run: (params: { id?: string; jobId?: string; mode?: 'due' | 'force' }) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
  }
  integrations: {
    patchChannels: (channelId: string, config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    runChannelsAdd: (channel: string, token: string) => Promise<{ success: boolean; error?: string }>
    ensurePlugin: (pluginId: string) => Promise<{ success: boolean; installed?: boolean; error?: string }>
    pairingApprove: (channel: string, code: string) => Promise<{ success: boolean; error?: string }>
  }
  skills: {
    list: () => Promise<{ success: boolean; skills: SkillData[]; error?: string }>
    toggle: (skillKey: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
    installZip: (zipBase64: string, fileName: string) => Promise<{ success: boolean; skillName?: string; error?: string }>
    installGithub: (githubUrl: string) => Promise<{ success: boolean; skillName?: string; error?: string }>
  }
  platform: string
}

interface Window {
  electronAPI: ElectronAPI
}
