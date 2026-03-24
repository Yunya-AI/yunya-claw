interface ClipboardRecordData {
  id: string
  text: string
  timestamp: number
  screenshotFile?: string
  analysis?: string
  pinned?: boolean
  tags?: string[]
}

// 桌面宠物动作
interface PetAction {
  name: string
  frames: string[]
  duration: number
  repeat?: number
  hidden?: boolean
  // 动作标签，用于状态匹配
  tags?: string[]
}

// 系统动作类型（对应 Agent 状态）
type SystemActionType = 'idle' | 'thinking' | 'responding' | 'error'

// 系统动作配置
interface SystemActionConfig {
  type: SystemActionType
  label: string
  description: string
  actionNames: string[] // 关联的自定义动作名称列表
}

// 形象库项
interface CharacterItem {
  id: string
  name: string
  imageDataUrl: string
  createdAt: number
}

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
    /** 监听对话刷新事件（从其他渠道触发） */
    onChatRefresh: (callback: (data: { sessionKey?: string }) => void) => () => void
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
    // 微信相关
    startWeixinQrcode: () => Promise<{ success: boolean; error?: string }>
    stopWeixinQrcode: () => Promise<{ success: boolean }>
    onWeixinQrcode: (callback: (data: { qrcodeUrl?: string; qrcodeAscii?: string }) => void) => () => void
  }
  skills: {
    list: () => Promise<{ success: boolean; skills: SkillData[]; error?: string }>
    toggle: (skillKey: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
    installZip: (zipBase64: string, fileName: string) => Promise<{ success: boolean; skillName?: string; error?: string }>
    installGithub: (githubUrl: string) => Promise<{ success: boolean; skillName?: string; error?: string }>
  }
  clipboard: {
    getRecords: (query?: string) => Promise<{ success: boolean; records: ClipboardRecordData[]; error?: string }>
    deleteRecord: (id: string) => Promise<{ success: boolean; error?: string }>
    clearAll: () => Promise<{ success: boolean; error?: string }>
    togglePin: (id: string) => Promise<{ success: boolean; error?: string }>
    getScreenshot: (fileName: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    paste: (text: string) => Promise<{ success: boolean; error?: string }>
    toggleMonitor: (enable: boolean) => Promise<{ success: boolean; enabled: boolean; error?: string }>
    status: () => Promise<{ success: boolean; enabled: boolean }>
    updateAnalysis: (id: string, analysis: string) => Promise<{ success: boolean; error?: string }>
  }
  desktopPet: {
    getConfig: () => Promise<{ success: boolean; config?: { enabled: boolean; size: number; useCustomActions?: boolean; chromakeyColor?: string; chromakeySimilarity?: number; chromakeyBlend?: number }; error?: string }>
    setSize: (size: number) => Promise<{ success: boolean; error?: string }>
    saveChromakeyConfig: (config: { color: string; similarity: number; blend: number }) => Promise<{ success: boolean; error?: string }>
    showContextMenu: () => Promise<{ success: boolean; error?: string }>
    toggle: (enable: boolean) => Promise<{ success: boolean; enabled?: boolean; error?: string }>
    startDrag: () => Promise<{ success: boolean }>
    drag: () => Promise<{ success: boolean }>
    endDrag: () => Promise<{ success: boolean }>
    getCustomActions: () => Promise<{ success: boolean; actions: PetAction[] }>
    getCustomActionsWithData: () => Promise<{ success: boolean; actions: PetAction[] }>
    getActionImage: (fileName: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    saveCustomActions: (actions: PetAction[]) => Promise<{ success: boolean; actions?: PetAction[]; error?: string }>
    uploadImage: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    saveImage: (base64Data: string) => Promise<{ success: boolean; path?: string; error?: string }>
    generateVideo: (params: { imageDataUrl: string; prompt?: string; duration?: number; aspectRatio?: string }) => Promise<{ success: boolean; gifPath?: string; gifDataUrl?: string; error?: string }>
    checkRembg: () => Promise<{ success: boolean; available: boolean }>
    playAction: (actionName: string) => Promise<{ success: boolean; error?: string }>
    onActionsUpdated: (callback: (data: { actions: Array<{ name: string; frames: string[]; duration: number; repeat?: number }>; useCustomActions: boolean }) => void) => () => void
    onPlayAction: (callback: (action: { name: string; frames: string[]; duration: number }) => void) => () => void
    // Agent 状态监听
    onAgentState: (callback: (data: { state: 'idle' | 'thinking' | 'responding' | 'error' }) => void) => () => void
    // 系统动作更新监听
    onSystemActionsUpdated: (callback: (data: { systemActions: SystemActionConfig[] }) => void) => () => void
    // 形象库
    getCharacterLibrary: () => Promise<{ success: boolean; characters: CharacterItem[]; error?: string }>
    addCharacter: (character: { name: string; imageDataUrl: string }) => Promise<{ success: boolean; character?: CharacterItem; error?: string }>
    deleteCharacter: (characterId: string) => Promise<{ success: boolean; error?: string }>
    updateCharacter: (characterId: string, updates: { name?: string; imageDataUrl?: string }) => Promise<{ success: boolean; character?: CharacterItem; error?: string }>
    // 系统动作
    getSystemActions: () => Promise<{ success: boolean; systemActions: SystemActionConfig[] }>
    saveSystemActions: (systemActions: SystemActionConfig[]) => Promise<{ success: boolean; error?: string }>
  }
  lifecycle: {
    onStep: (callback: (data: { phase: 'starting' | 'stopping'; step: string }) => void) => () => void
  }
  platform: string
}

interface Window {
  electronAPI: ElectronAPI
}
