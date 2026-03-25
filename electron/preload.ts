import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  gateway: {
    start: () => ipcRenderer.invoke('gateway:start'),
    stop: () => ipcRenderer.invoke('gateway:stop'),
    status: () => ipcRenderer.invoke('gateway:status'),
    token: () => ipcRenderer.invoke('gateway:token'),
    onLog: (callback: (msg: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, msg: string) => callback(msg)
      ipcRenderer.on('gateway:log', wrapped)
      return () => ipcRenderer.removeListener('gateway:log', wrapped)
    },
    onError: (callback: (msg: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, msg: string) => callback(msg)
      ipcRenderer.on('gateway:error', wrapped)
      return () => ipcRenderer.removeListener('gateway:error', wrapped)
    },
    onStatus: (callback: (status: { running: boolean; code?: number }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: { running: boolean; code?: number }) => callback(status)
      ipcRenderer.on('gateway:status', wrapped)
      return () => ipcRenderer.removeListener('gateway:status', wrapped)
    },
    // 新增：监听对话刷新事件（从其他渠道触发)
    onChatRefresh: (callback: (data: { sessionKey?: string }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { sessionKey?: string }) => callback(data)
      ipcRenderer.on('gateway:chatRefresh', wrapped)
      return () => ipcRenderer.removeListener('gateway:chatRefresh', wrapped)
    }
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  /** yunyaClaw.json 统一配置服务，所有子字段修改均通过此 API 避免冲突 */
  yunyaClaw: {
    read: () => ipcRenderer.invoke('yunyaClaw:read'),
    get: (key: string) => ipcRenderer.invoke('yunyaClaw:get', key),
    update: (partial: Record<string, unknown>) => ipcRenderer.invoke('yunyaClaw:update', partial),
  },
  /** 应用外观：名称、图标 */
  appearance: {
    get: () => ipcRenderer.invoke('appearance:get'),
    getIconDataUrl: () => ipcRenderer.invoke('appearance:getIconDataUrl'),
    setAppName: (appName: string) => ipcRenderer.invoke('appearance:setAppName', appName),
    setIcon: (base64: string) => ipcRenderer.invoke('appearance:setIcon', base64),
    clearIcon: () => ipcRenderer.invoke('appearance:clearIcon'),
  },
  prefs: {
    getHiddenSessions: () => ipcRenderer.invoke('prefs:getHiddenSessions'),
    setHiddenSessions: (data: Record<string, string[]>) => ipcRenderer.invoke('prefs:setHiddenSessions', data),
  },
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (config: Record<string, unknown>) => ipcRenderer.invoke('config:write', config),
    saveProviders: (providers: unknown[], selectedModel?: { providerKey: string; modelId: string }) =>
      ipcRenderer.invoke('config:saveProviders', providers, selectedModel),
    saveAgentModel: (agentId: string, model: string) => ipcRenderer.invoke('config:saveAgentModel', agentId, model),
    saveAgentIdentity: (agentId: string, identity: { name?: string; emoji?: string; avatar?: string }) =>
      ipcRenderer.invoke('config:saveAgentIdentity', agentId, identity),
  },
  chat: {
    listSessions: () => ipcRenderer.invoke('chat:listSessions'),
    loadSession: (sessionId: string) => ipcRenderer.invoke('chat:loadSession', sessionId),
    saveSession: (session: unknown) => ipcRenderer.invoke('chat:saveSession', session),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('chat:deleteSession', sessionId),
    loadOpenClawTranscript: (sessionId: string) => ipcRenderer.invoke('chat:loadOpenClawTranscript', sessionId),
    resetSession: (agentId: string, reason?: 'new' | 'reset') => ipcRenderer.invoke('chat:resetSession', agentId, reason),
    abort: (sessionKey: string, runId?: string) => ipcRenderer.invoke('chat:abort', sessionKey, runId),
    listGatewaySessions: (agentId: string) => ipcRenderer.invoke('chat:listGatewaySessions', agentId),
    patchGatewaySession: (sessionKey: string, label: string) => ipcRenderer.invoke('chat:patchGatewaySession', sessionKey, label),
    resetGatewaySession: (sessionKey: string, reason?: 'new' | 'reset') => ipcRenderer.invoke('chat:resetGatewaySession', sessionKey, reason),
  },
  media: {
    readFile: (mediaUrl: string) => ipcRenderer.invoke('media:readFile', mediaUrl),
  },
  util: {
    openExternal: (url: string) => ipcRenderer.invoke('util:openExternal', url),
    saveImage: (imageUrl: string, suggestedName?: string) =>
      ipcRenderer.invoke('util:saveImage', imageUrl, suggestedName),
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    saveAvatar: (agentId: string, base64DataUrl: string) =>
      ipcRenderer.invoke('agents:saveAvatar', agentId, base64DataUrl),
    create: (params: { name: string; code?: string; emoji?: string }) => ipcRenderer.invoke('agents:create', params),
    delete: (agentId: string) => ipcRenderer.invoke('agents:delete', agentId),
    update: (params: { agentId: string; name?: string; model?: string }) => ipcRenderer.invoke('agents:update', params),
    rename: (params: { agentId: string; newName: string }) => ipcRenderer.invoke('agents:rename', params),
  },
  persona: {
    getFiles: (agentId: string) => ipcRenderer.invoke('persona:getFiles', agentId),
    getWorkspacePath: (agentId: string) => ipcRenderer.invoke('persona:getWorkspacePath', agentId),
    listFiles: (agentId: string) => ipcRenderer.invoke('persona:listFiles', agentId),
    getFile: (params: { agentId: string; file: string }) => ipcRenderer.invoke('persona:getFile', params),
    saveFile: (params: { agentId: string; file: string; content: string }) =>
      ipcRenderer.invoke('persona:saveFile', params),
    saveSimple: (params: {
      agentId: string
      identity?: { name?: string; creature?: string; vibe?: string; emoji?: string; avatar?: string }
      soul?: string
      user?: { name?: string; preferredAddress?: string; notes?: string }
    }) => ipcRenderer.invoke('persona:saveSimple', params),
    saveRaw: (params: { agentId: string; file: string; content: string }) =>
      ipcRenderer.invoke('persona:saveRaw', params),
  },
  env: {
    read: () => ipcRenderer.invoke('env:read'),
    write: (entries: Array<{ key: string; value: string }>) => ipcRenderer.invoke('env:write', entries),
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  cron: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('cron:list', params),
    status: () => ipcRenderer.invoke('cron:status'),
    add: (params: Record<string, unknown>) => ipcRenderer.invoke('cron:add', params),
    update: (params: { id?: string; jobId?: string; patch: Record<string, unknown> }) =>
      ipcRenderer.invoke('cron:update', params),
    remove: (params: { id?: string; jobId?: string }) => ipcRenderer.invoke('cron:remove', params),
    run: (params: { id?: string; jobId?: string; mode?: 'due' | 'force' }) =>
      ipcRenderer.invoke('cron:run', params),
  },
  integrations: {
    patchChannels: (channelId: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('config:patchChannels', channelId, config),
    runChannelsAdd: (channel: string, token: string) =>
      ipcRenderer.invoke('integrations:runChannelsAdd', channel, token),
    ensurePlugin: (pluginId: string) => ipcRenderer.invoke('integrations:ensurePlugin', pluginId),
    pairingApprove: (channel: string, code: string) =>
      ipcRenderer.invoke('integrations:pairingApprove', channel, code),
    // 微信相关
    startWeixinQrcode: () => ipcRenderer.invoke('integrations:startWeixinQrcode'),
    stopWeixinQrcode: () => ipcRenderer.invoke('integrations:stopWeixinQrcode'),
    onWeixinQrcode: (callback: (data: { qrcodeUrl?: string; qrcodeAscii?: string }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { qrcodeUrl?: string; qrcodeAscii?: string }) => callback(data)
      ipcRenderer.on('integrations:weixinQrcode', wrapped)
      return () => ipcRenderer.removeListener('integrations:weixinQrcode', wrapped)
    },
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    toggle: (skillKey: string, enabled: boolean) => ipcRenderer.invoke('skills:toggle', skillKey, enabled),
    installZip: (zipBase64: string, fileName: string) => ipcRenderer.invoke('skills:installZip', zipBase64, fileName),
    installGithub: (githubUrl: string) => ipcRenderer.invoke('skills:installGithub', githubUrl),
  },
  clipboard: {
    getRecords: (query?: string) => ipcRenderer.invoke('clipboard:getRecords', query),
    deleteRecord: (id: string) => ipcRenderer.invoke('clipboard:deleteRecord', id),
    clearAll: () => ipcRenderer.invoke('clipboard:clearAll'),
    togglePin: (id: string) => ipcRenderer.invoke('clipboard:togglePin', id),
    getScreenshot: (fileName: string) => ipcRenderer.invoke('clipboard:getScreenshot', fileName),
    paste: (text: string) => ipcRenderer.invoke('clipboard:paste', text),
    toggleMonitor: (enable: boolean) => ipcRenderer.invoke('clipboard:toggleMonitor', enable),
    status: () => ipcRenderer.invoke('clipboard:status'),
    updateAnalysis: (id: string, analysis: string) => ipcRenderer.invoke('clipboard:updateAnalysis', id, analysis),
    onShow: (callback: () => void) => {
      const wrapped = () => callback()
      ipcRenderer.on('quickpaste:show', wrapped)
      return () => ipcRenderer.removeListener('quickpaste:show', wrapped)
    },
  },
  desktopPet: {
    getConfig: () => ipcRenderer.invoke('desktopPet:getConfig'),
    setSize: (size: number) => ipcRenderer.invoke('desktopPet:setSize', size),
    saveChromakeyConfig: (config: { color: string; similarity: number; blend: number }) =>
      ipcRenderer.invoke('desktopPet:saveChromakeyConfig', config),
    showContextMenu: () => ipcRenderer.invoke('desktopPet:showContextMenu'),
    toggle: (enable: boolean) => ipcRenderer.invoke('desktopPet:toggle', enable),
    startDrag: () => ipcRenderer.invoke('desktopPet:startDrag'),
    drag: () => ipcRenderer.invoke('desktopPet:drag'),
    endDrag: () => ipcRenderer.invoke('desktopPet:endDrag'),
    getCustomActions: () => ipcRenderer.invoke('desktopPet:getCustomActions'),
    getCustomActionsWithData: () => ipcRenderer.invoke('desktopPet:getCustomActionsWithData'),
    getActionImage: (fileName: string) => ipcRenderer.invoke('desktopPet:getActionImage', fileName),
    saveCustomActions: (actions: unknown[]) => ipcRenderer.invoke('desktopPet:saveCustomActions', actions),
    uploadImage: () => ipcRenderer.invoke('desktopPet:uploadImage'),
    saveImage: (base64Data: string) => ipcRenderer.invoke('desktopPet:saveImage', base64Data),
    generateVideo: (params: { imageDataUrl: string; prompt?: string; duration?: number }) =>
      ipcRenderer.invoke('desktopPet:generateVideo', params),
    checkRembg: () => ipcRenderer.invoke('desktopPet:checkRembg'),
    playAction: (actionName: string) => ipcRenderer.invoke('desktopPet:playAction', actionName),
    onActionsUpdated: (callback: (data: { actions: Array<{ name: string; frames: string[]; duration: number; repeat?: number }>; useCustomActions: boolean }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { actions: Array<{ name: string; frames: string[]; duration: number; repeat?: number }>; useCustomActions: boolean }) => callback(data)
      ipcRenderer.on('desktopPet:actionsUpdated', wrapped)
      return () => ipcRenderer.removeListener('desktopPet:actionsUpdated', wrapped)
    },
    onPlayAction: (callback: (action: { name: string; frames: string[]; duration: number }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, action: { name: string; frames: string[]; duration: number }) => callback(action)
      ipcRenderer.on('desktopPet:playAction', wrapped)
      return () => ipcRenderer.removeListener('desktopPet:playAction', wrapped)
    },
    // Agent 状态监听
    onAgentState: (callback: (data: { state: 'idle' | 'thinking' | 'responding' | 'error' }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { state: 'idle' | 'thinking' | 'responding' | 'error' }) => callback(data)
      ipcRenderer.on('desktopPet:agentState', wrapped)
      return () => ipcRenderer.removeListener('desktopPet:agentState', wrapped)
    },
    // 系统动作更新监听
    onSystemActionsUpdated: (callback: (data: { systemActions: Array<{ type: string; label: string; description: string; actionNames: string[] }> }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { systemActions: Array<{ type: string; label: string; description: string; actionNames: string[] }> }) => callback(data)
      ipcRenderer.on('desktopPet:systemActionsUpdated', wrapped)
      return () => ipcRenderer.removeListener('desktopPet:systemActionsUpdated', wrapped)
    },
    // 形象库
    getCharacterLibrary: () => ipcRenderer.invoke('desktopPet:getCharacterLibrary'),
    addCharacter: (character: { name: string; imageDataUrl: string }) =>
      ipcRenderer.invoke('desktopPet:addCharacter', character),
    deleteCharacter: (characterId: string) => ipcRenderer.invoke('desktopPet:deleteCharacter', characterId),
    updateCharacter: (characterId: string, updates: { name?: string; imageDataUrl?: string }) =>
      ipcRenderer.invoke('desktopPet:updateCharacter', characterId, updates),
    // 系统动作
    getSystemActions: () => ipcRenderer.invoke('desktopPet:getSystemActions'),
    saveSystemActions: (systemActions: unknown[]) => ipcRenderer.invoke('desktopPet:saveSystemActions', systemActions),
  },
  /** 智能感知系统 */
  petIntelligence: {
    getConfig: () => ipcRenderer.invoke('petIntelligence:getConfig'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('petIntelligence:saveConfig', config),
    toggle: (enabled: boolean) => ipcRenderer.invoke('petIntelligence:toggle', enabled),
    getDefaultRules: () => ipcRenderer.invoke('petIntelligence:getDefaultRules'),
    updateWindow: () => ipcRenderer.invoke('petIntelligence:updateWindow'),
    testAction: (actionName: string) => ipcRenderer.invoke('petIntelligence:testAction', actionName),
  },
  lifecycle: {
    onStep: (callback: (data: { phase: 'starting' | 'stopping'; step: string }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, data: { phase: 'starting' | 'stopping'; step: string }) => callback(data)
      ipcRenderer.on('app:lifecycle', wrapped)
      return () => ipcRenderer.removeListener('app:lifecycle', wrapped)
    },
  },
  platform: process.platform,
})
