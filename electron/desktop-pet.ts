import { BrowserWindow, screen, ipcMain, Menu, app, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import https from 'node:https'
import { spawn } from 'node:child_process'

// 桌面宠物窗口
let petWindow: BrowserWindow | null = null

// YunYa 基础目录
function getYunyaDir(): string {
  const configDir = path.join(app.getPath('userData'), 'openclaw', 'yunya')
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  return configDir
}

// 桌面宠物目录
function getDesktopPetDir(): string {
  const dir = path.join(getYunyaDir(), 'desktop-pet')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 宠物配置文件路径
function getPetConfigPath(): string {
  return path.join(getDesktopPetDir(), 'config.json')
}

// 自定义动作配置文件路径（轻量版，不含 base64）
function getCustomActionsPath(): string {
  return path.join(getDesktopPetDir(), 'actions.json')
}

// 自定义动作图片目录
function getActionImagesDir(): string {
  const dir = path.join(getDesktopPetDir(), 'action-images')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 图片资源目录（保留用于其他用途）
function getPetImagesDir(): string {
  const dir = path.join(getDesktopPetDir(), 'images')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 形象库配置文件路径
function getCharacterLibraryPath(): string {
  return path.join(getDesktopPetDir(), 'character-library.json')
}

// 系统动作配置文件路径
function getSystemActionsPath(): string {
  return path.join(getDesktopPetDir(), 'system-actions.json')
}

// 系统动作类型
type SystemActionType = 'idle' | 'thinking' | 'responding' | 'error'

// 系统动作配置
interface SystemActionConfig {
  type: SystemActionType
  label: string
  description: string
  actionNames: string[]
}

// 默认系统动作配置
const DEFAULT_SYSTEM_ACTIONS: SystemActionConfig[] = [
  { type: 'idle', label: '闲置', description: 'Agent 无活动时的默认状态', actionNames: [] },
  { type: 'thinking', label: '思考中', description: 'Agent 正在处理请求', actionNames: [] },
  { type: 'responding', label: '回复中', description: 'Agent 正在输出回复', actionNames: [] },
  { type: 'error', label: '错误', description: '发生错误时的状态', actionNames: [] },
]

// 获取系统动作配置
export function getSystemActions(): SystemActionConfig[] {
  try {
    const systemActionsPath = getSystemActionsPath()
    if (fs.existsSync(systemActionsPath)) {
      const raw = fs.readFileSync(systemActionsPath, 'utf-8')
      const saved = JSON.parse(raw) as SystemActionConfig[]
      // 合并默认配置（确保所有类型都存在）
      return DEFAULT_SYSTEM_ACTIONS.map(defaultAction => {
        const savedAction = saved.find(a => a.type === defaultAction.type)
        if (savedAction) {
          return { ...defaultAction, actionNames: savedAction.actionNames }
        }
        return defaultAction
      })
    }
  } catch (err) {
    console.error('[DesktopPet] 读取系统动作配置失败:', err)
  }
  return DEFAULT_SYSTEM_ACTIONS
}

// 保存系统动作配置
function saveSystemActions(systemActions: SystemActionConfig[]): void {
  try {
    const systemActionsPath = getSystemActionsPath()
    const dir = path.dirname(systemActionsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(systemActionsPath, JSON.stringify(systemActions, null, 2), 'utf-8')
  } catch (err) {
    console.error('[DesktopPet] 保存系统动作配置失败:', err)
  }
}

// 形象库图片目录
function getCharacterImagesDir(): string {
  const dir = path.join(getDesktopPetDir(), 'character-images')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 形象接口
interface CharacterItem {
  id: string
  name: string
  imageDataUrl: string
  createdAt: number
}

// 获取形象库列表
function getCharacterLibrary(): CharacterItem[] {
  try {
    const libraryPath = getCharacterLibraryPath()
    if (fs.existsSync(libraryPath)) {
      const raw = fs.readFileSync(libraryPath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('[DesktopPet] 读取形象库失败:', err)
  }
  return []
}

// 保存形象库
function saveCharacterLibrary(characters: CharacterItem[]): void {
  try {
    const libraryPath = getCharacterLibraryPath()
    const dir = path.dirname(libraryPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(libraryPath, JSON.stringify(characters, null, 2), 'utf-8')
  } catch (err) {
    console.error('[DesktopPet] 保存形象库失败:', err)
  }
}

// 默认配置
const defaultConfig = {
  enabled: false,
  size: 128,
  x: undefined as number | undefined,
  y: undefined as number | undefined,
  useCustomActions: false, // 是否使用自定义动作
  // 抠图参数
  chromakeyColor: '0x00FF00', // 绿色
  chromakeySimilarity: 0.27,  // 相似度
  chromakeyBlend: 0.1,        // 混合度
}

// 读取配置
export function getPetConfig(): typeof defaultConfig {
  try {
    const configPath = getPetConfigPath()
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8')
      return { ...defaultConfig, ...JSON.parse(raw) }
    }
  } catch (err) {
    console.error('[DesktopPet] 读取配置失败:', err)
  }
  return { ...defaultConfig }
}

// 保存配置
function savePetConfig(config: Partial<typeof defaultConfig>): void {
  try {
    const configPath = getPetConfigPath()
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const current = getPetConfig()
    fs.writeFileSync(configPath, JSON.stringify({ ...current, ...config }, null, 2), 'utf-8')
  } catch (err) {
    console.error('[DesktopPet] 保存配置失败:', err)
  }
}

// 动作接口（轻量版，frames 存储文件名）
interface PetAction {
  name: string
  frames: string[]  // 文件名或 emoji
  duration: number
  repeat?: number
  hidden?: boolean
  tags?: string[]
}

// 动作接口（完整版，frames 存储 base64）
interface PetActionWithData {
  name: string
  frames: string[]  // base64 或 emoji
  duration: number
  repeat?: number
  hidden?: boolean
  tags?: string[]
}

// 判断是否是图片数据（base64 或文件路径）
function isImageFrame(frame: string): boolean {
  return frame.startsWith('data:image') || frame.startsWith('file:') || frame.startsWith('http')
}

// 判断是否是文件引用（以 @ 开头表示是文件名）
function isFileReference(frame: string): boolean {
  return frame.startsWith('@file:')
}

// 保存 base64 图片到文件，返回文件引用
function saveActionImage(base64Data: string, actionName: string, frameIndex: number): string | null {
  try {
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      console.error('[DesktopPet] 无效的图片数据')
      return null
    }

    const ext = matches[1] === 'gif' ? 'gif' : matches[1]
    const data = matches[2]
    const hash = crypto.createHash('md5').update(data).digest('hex').substring(0, 8)
    const fileName = `${actionName}_${frameIndex}_${hash}.${ext}`
    const imagesDir = getActionImagesDir()
    const filePath = path.join(imagesDir, fileName)

    // 如果文件已存在则直接返回
    if (fs.existsSync(filePath)) {
      return `@file:${fileName}`
    }

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    return `@file:${fileName}`
  } catch (err) {
    console.error('[DesktopPet] 保存动作图片失败:', err)
    return null
  }
}

// 读取图片文件并返回 base64
function loadActionImage(fileName: string): string | null {
  try {
    const filePath = path.join(getActionImagesDir(), fileName)
    if (!fs.existsSync(filePath)) {
      return null
    }
    const data = fs.readFileSync(filePath)
    const ext = path.extname(fileName).slice(1).toLowerCase()
    const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
    return `data:${mimeType};base64,${data.toString('base64')}`
  } catch (err) {
    console.error('[DesktopPet] 读取动作图片失败:', err)
    return null
  }
}

// 读取自定义动作（轻量版，不含图片数据）
export function getCustomActions(): PetAction[] {
  try {
    const actionsPath = getCustomActionsPath()
    if (fs.existsSync(actionsPath)) {
      const raw = fs.readFileSync(actionsPath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('[DesktopPet] 读取自定义动作失败:', err)
  }
  return []
}

// 读取自定义动作（完整版，包含图片数据）
export function getCustomActionsWithData(): PetActionWithData[] {
  const actions = getCustomActions()
  return actions.map(action => ({
    ...action,
    frames: action.frames.map(frame => {
      if (isFileReference(frame)) {
        const fileName = frame.slice(6) // 去掉 '@file:' 前缀
        const data = loadActionImage(fileName)
        return data || frame
      }
      return frame
    })
  }))
}

// 保存自定义动作（将 base64 转为文件）
function saveCustomActions(actions: PetActionWithData[]): PetAction[] {
  const imagesDir = getActionImagesDir()
  const lightActions: PetAction[] = []

  try {
    for (const action of actions) {
      const lightFrames: string[] = []

      for (let i = 0; i < action.frames.length; i++) {
        const frame = action.frames[i]

        if (frame.startsWith('data:image')) {
          // base64 数据，保存为文件
          const fileRef = saveActionImage(frame, action.name, i)
          lightFrames.push(fileRef || frame)
        } else if (isFileReference(frame)) {
          // 已经是文件引用，直接保留
          lightFrames.push(frame)
        } else {
          // emoji 或其他，直接保留
          lightFrames.push(frame)
        }
      }

      lightActions.push({
        name: action.name,
        frames: lightFrames,
        duration: action.duration,
        repeat: action.repeat,
        hidden: action.hidden,
        tags: action.tags,
      })
    }

    const actionsPath = getCustomActionsPath()
    fs.writeFileSync(actionsPath, JSON.stringify(lightActions, null, 2), 'utf-8')

    // 清理未使用的图片文件
    cleanupUnusedImages(lightActions)

    return lightActions
  } catch (err) {
    console.error('[DesktopPet] 保存自定义动作失败:', err)
    return actions
  }
}

// 清理未使用的图片文件
function cleanupUnusedImages(actions: PetAction[]): void {
  try {
    const imagesDir = getActionImagesDir()
    const usedFiles = new Set<string>()

    for (const action of actions) {
      for (const frame of action.frames) {
        if (isFileReference(frame)) {
          usedFiles.add(frame.slice(6))
        }
      }
    }

    const files = fs.readdirSync(imagesDir)
    for (const file of files) {
      if (!usedFiles.has(file)) {
        const filePath = path.join(imagesDir, file)
        fs.unlinkSync(filePath)
        console.log('[DesktopPet] 清理未使用图片:', file)
      }
    }
  } catch (err) {
    console.error('[DesktopPet] 清理图片失败:', err)
  }
}

// 保存图片并返回本地路径
function savePetImage(base64Data: string): string | null {
  try {
    // 解析 base64 数据
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      console.error('[DesktopPet] 无效的图片数据')
      return null
    }

    const ext = matches[1]
    const data = matches[2]
    const hash = crypto.createHash('md5').update(data).digest('hex').substring(0, 12)
    const fileName = `pet-${hash}.${ext}`
    const imagesDir = getPetImagesDir()
    const filePath = path.join(imagesDir, fileName)

    // 如果文件已存在则直接返回
    if (fs.existsSync(filePath)) {
      return filePath
    }

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    return filePath
  } catch (err) {
    console.error('[DesktopPet] 保存图片失败:', err)
    return null
  }
}

// 创建桌面宠物窗口
export function createPetWindow(mainWindow: BrowserWindow | null): BrowserWindow | null {
  console.log('[DesktopPet] createPetWindow called, mainWindow:', !!mainWindow)

  if (petWindow && !petWindow.isDestroyed()) {
    console.log('[DesktopPet] Window exists, showing...')
    petWindow.show()
    return petWindow
  }

  const config = getPetConfig()
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  // 计算位置（默认右下角）
  const petSize = config.size || 128
  const x = config.x ?? screenWidth - petSize - 20
  const y = config.y ?? screenHeight - petSize - 20

  console.log('[DesktopPet] Creating window at:', x, y, 'size:', petSize)

  petWindow = new BrowserWindow({
    width: petSize,
    height: petSize,
    x,
    y,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true, // 需要可聚焦才能接收点击事件
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 加载页面
  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
  console.log('[DesktopPet] VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL)
  if (VITE_DEV_SERVER_URL) {
    const url = `${VITE_DEV_SERVER_URL}?mode=desktoppet`
    console.log('[DesktopPet] Loading URL:', url)
    petWindow.loadURL(url)
  } else {
    const distIndex = path.join(process.env.DIST!, 'index.html')
    console.log('[DesktopPet] Loading file:', distIndex)
    petWindow.loadFile(distIndex, { query: { mode: 'desktoppet' } })
  }

  // 调试：显示 DevTools
  if (process.env.OPENCLAW_DEBUG) {
    petWindow.webContents.openDevTools({ mode: 'detach' })
  }

  petWindow.webContents.on('did-finish-load', () => {
    console.log('[DesktopPet] Page loaded successfully')
  })

  petWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[DesktopPet] Page load failed:', errorCode, errorDescription)
  })

  // 窗口关闭时清理
  petWindow.on('closed', () => {
    petWindow = null
  })

  // 保存位置
  petWindow.on('moved', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      const [x, y] = petWindow.getPosition()
      savePetConfig({ x, y })
    }
  })

  // 监听窗口尺寸变化，防止意外缩放
  petWindow.on('resize', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      const config = getPetConfig()
      const currentSize = petWindow.getSize()
      const expectedSize = config.size || 128
      if (currentSize[0] !== expectedSize || currentSize[1] !== expectedSize) {
        console.log('[DesktopPet] 检测到意外的尺寸变化，从', currentSize, '恢复为:', expectedSize)
        petWindow.setSize(expectedSize, expectedSize)
      }
    }
  })

  return petWindow
}

// 显示/隐藏宠物
export function togglePetWindow(mainWindow: BrowserWindow | null): boolean {
  if (petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    petWindow.hide()
    savePetConfig({ enabled: false })
    return false
  } else {
    createPetWindow(mainWindow)
    savePetConfig({ enabled: true })
    return true
  }
}

// 显示宠物
export function showPetWindow(mainWindow: BrowserWindow | null): void {
  createPetWindow(mainWindow)
  savePetConfig({ enabled: true })
}

// 隐藏宠物
export function hidePetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.hide()
  }
  savePetConfig({ enabled: false })
}

// 宠物是否可见
export function isPetWindowVisible(): boolean {
  return petWindow !== null && !petWindow.isDestroyed() && petWindow.isVisible()
}

// 发送 Agent 状态到宠物窗口
export function sendAgentStateToPet(state: 'idle' | 'thinking' | 'responding' | 'error'): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('desktopPet:agentState', { state })
    console.log('[DesktopPet] 发送 Agent 状态到宠物窗口:', state, 'petWindow存在:', !!petWindow)
  }
}

// 恢复宠物状态
export function restorePetState(mainWindow: BrowserWindow | null): void {
  const config = getPetConfig()
  if (config.enabled) {
    createPetWindow(mainWindow)
  }
}

// IPC 注册
export function registerDesktopPetIpc(): void {
  // 拖拽相关变量
  let dragStartPos: { x: number; y: number } | null = null
  let windowStartPos: [number, number] | null = null

  ipcMain.handle('desktopPet:getConfig', () => {
    return { success: true, config: getPetConfig() }
  })

  // 开始拖拽
  ipcMain.handle('desktopPet:startDrag', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      dragStartPos = screen.getCursorScreenPoint()
      const pos = petWindow.getPosition()
      windowStartPos = [pos[0], pos[1]]
    }
    return { success: true }
  })

  // 拖拽移动
  ipcMain.handle('desktopPet:drag', () => {
    if (petWindow && !petWindow.isDestroyed() && dragStartPos && windowStartPos) {
      const currentPos = screen.getCursorScreenPoint()
      const dx = currentPos.x - dragStartPos.x
      const dy = currentPos.y - dragStartPos.y
      // 使用 setBounds 同时设置位置和尺寸，避免 Windows 下透明窗口的尺寸漂移问题
      const config = getPetConfig()
      const size = config.size || 128
      petWindow.setBounds({
        x: windowStartPos[0] + dx,
        y: windowStartPos[1] + dy,
        width: size,
        height: size,
      })
    }
    return { success: true }
  })

  // 结束拖拽
  ipcMain.handle('desktopPet:endDrag', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      const [x, y] = petWindow.getPosition()
      savePetConfig({ x, y })
    }
    dragStartPos = null
    windowStartPos = null
    return { success: true }
  })

  ipcMain.handle('desktopPet:setSize', (_event, size: number) => {
    console.log('[DesktopPet] setSize called:', size, 'petWindow exists:', !!petWindow)
    savePetConfig({ size })
    if (petWindow && !petWindow.isDestroyed()) {
      // 先设置最小尺寸为0，允许缩小
      petWindow.setMinimumSize(1, 1)
      petWindow.setSize(size, size)
      console.log('[DesktopPet] Window size updated to:', size)
    }
    return { success: true }
  })

  ipcMain.handle('desktopPet:saveChromakeyConfig', (_event, config: { color: string; similarity: number; blend: number }) => {
    console.log('[DesktopPet] saveChromakeyConfig called:', config)
    savePetConfig({
      chromakeyColor: config.color,
      chromakeySimilarity: config.similarity,
      chromakeyBlend: config.blend,
    })
    return { success: true }
  })

  ipcMain.handle('desktopPet:showContextMenu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: '移动到右下角',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) {
            const display = screen.getPrimaryDisplay()
            const { width, height } = display.workAreaSize
            const config = getPetConfig()
            const size = config.size || 128
            petWindow.setPosition(width - size - 20, height - size - 20)
          }
        },
      },
      {
        label: '移动到左下角',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) {
            const display = screen.getPrimaryDisplay()
            const { height } = display.workAreaSize
            const config = getPetConfig()
            const size = config.size || 128
            petWindow.setPosition(20, height - size - 20)
          }
        },
      },
      { type: 'separator' },
      {
        label: '小 (64px)',
        click: () => {
          savePetConfig({ size: 64 })
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.setSize(64, 64)
          }
        },
      },
      {
        label: '中 (128px)',
        click: () => {
          savePetConfig({ size: 128 })
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.setSize(128, 128)
          }
        },
      },
      {
        label: '大 (256px)',
        click: () => {
          savePetConfig({ size: 256 })
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.setSize(256, 256)
          }
        },
      },
      { type: 'separator' },
      {
        label: '隐藏宠物',
        click: () => {
          hidePetWindow()
        },
      },
    ])
    menu.popup()
    return { success: true }
  })

  ipcMain.handle('desktopPet:toggle', (_event, enable: boolean) => {
    console.log('[DesktopPet] toggle called, enable:', enable)
    if (enable) {
      // 需要从主窗口获取实例，这里通过全局变量传递
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows().find((w: Electron.BrowserWindow) => !w.webContents.getURL().includes('desktoppet'))
      console.log('[DesktopPet] Found mainWindow:', !!mainWindow)
      showPetWindow(mainWindow || null)
      return { success: true, enabled: true }
    } else {
      hidePetWindow()
      return { success: true, enabled: false }
    }
  })

  // 获取自定义动作（轻量版，不含图片数据）
  ipcMain.handle('desktopPet:getCustomActions', () => {
    return { success: true, actions: getCustomActions() }
  })

  // 获取自定义动作（完整版，含图片数据）
  ipcMain.handle('desktopPet:getCustomActionsWithData', () => {
    return { success: true, actions: getCustomActionsWithData() }
  })

  // 获取单个动作图片
  ipcMain.handle('desktopPet:getActionImage', (_event, fileName: string) => {
    const data = loadActionImage(fileName)
    if (data) {
      return { success: true, dataUrl: data }
    }
    return { success: false, error: '图片不存在' }
  })

  // 保存自定义动作
  ipcMain.handle('desktopPet:saveCustomActions', (_event, actions: PetActionWithData[]) => {
    console.log('[DesktopPet] 保存自定义动作:', actions.length, '个')
    const lightActions = saveCustomActions(actions)
    // 更新配置使用自定义动作
    savePetConfig({ useCustomActions: actions.length > 0 })
    // 通知化身窗口刷新配置（发送完整数据）
    if (petWindow && !petWindow.isDestroyed()) {
      console.log('[DesktopPet] 发送动作更新事件到化身窗口')
      const fullActions = getCustomActionsWithData()
      petWindow.webContents.send('desktopPet:actionsUpdated', { actions: fullActions, useCustomActions: actions.length > 0 })
    } else {
      console.log('[DesktopPet] 化身窗口不存在，跳过通知')
    }
    return { success: true, actions: lightActions }
  })

  // 上传图片
  ipcMain.handle('desktopPet:uploadImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    const filePath = result.filePaths[0]
    try {
      const ext = path.extname(filePath).slice(1).toLowerCase()
      const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
      const data = fs.readFileSync(filePath)
      const base64 = `data:${mimeType};base64,${data.toString('base64')}`
      return { success: true, dataUrl: base64 }
    } catch (err) {
      console.error('[DesktopPet] 读取图片失败:', err)
      return { success: false, error: '读取图片失败' }
    }
  })

  // 保存 base64 图片到本地
  ipcMain.handle('desktopPet:saveImage', (_event, base64Data: string) => {
    const filePath = savePetImage(base64Data)
    if (filePath) {
      return { success: true, path: filePath }
    }
    return { success: false, error: '保存图片失败' }
  })

  // 检查 rembg 是否可用
  ipcMain.handle('desktopPet:checkRembg', async () => {
    const available = await checkRembgAvailable()
    return { success: true, available }
  })

  // 在化身窗口播放指定动作
  ipcMain.handle('desktopPet:playAction', (_event, actionName: string) => {
    if (petWindow && !petWindow.isDestroyed()) {
      // 获取自定义动作
      const actions = getCustomActions()
      const action = actions.find(a => a.name === actionName)
      if (action) {
        console.log('[DesktopPet] 在化身窗口播放动作:', actionName)
        petWindow.webContents.send('desktopPet:playAction', action)
        return { success: true }
      } else {
        return { success: false, error: '未找到该动作' }
      }
    }
    return { success: false, error: '化身窗口未打开' }
  })

  // ========== 形象库相关 ==========

  // 获取形象库列表
  ipcMain.handle('desktopPet:getCharacterLibrary', () => {
    const characters = getCharacterLibrary()
    return { success: true, characters }
  })

  // 添加形象到形象库
  ipcMain.handle('desktopPet:addCharacter', (_event, character: { name: string; imageDataUrl: string }) => {
    try {
      const characters = getCharacterLibrary()
      const newCharacter: CharacterItem = {
        id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: character.name,
        imageDataUrl: character.imageDataUrl,
        createdAt: Date.now(),
      }
      characters.push(newCharacter)
      saveCharacterLibrary(characters)
      console.log('[DesktopPet] 添加形象成功:', newCharacter.id)
      return { success: true, character: newCharacter }
    } catch (err) {
      console.error('[DesktopPet] 添加形象失败:', err)
      return { success: false, error: '添加形象失败' }
    }
  })

  // 删除形象
  ipcMain.handle('desktopPet:deleteCharacter', (_event, characterId: string) => {
    try {
      const characters = getCharacterLibrary()
      const index = characters.findIndex(c => c.id === characterId)
      if (index !== -1) {
        characters.splice(index, 1)
        saveCharacterLibrary(characters)
        console.log('[DesktopPet] 删除形象成功:', characterId)
        return { success: true }
      }
      return { success: false, error: '未找到该形象' }
    } catch (err) {
      console.error('[DesktopPet] 删除形象失败:', err)
      return { success: false, error: '删除形象失败' }
    }
  })

  // 更新形象
  ipcMain.handle('desktopPet:updateCharacter', (_event, characterId: string, updates: { name?: string; imageDataUrl?: string }) => {
    try {
      const characters = getCharacterLibrary()
      const character = characters.find(c => c.id === characterId)
      if (character) {
        if (updates.name !== undefined) character.name = updates.name
        if (updates.imageDataUrl !== undefined) character.imageDataUrl = updates.imageDataUrl
        saveCharacterLibrary(characters)
        console.log('[DesktopPet] 更新形象成功:', characterId)
        return { success: true, character }
      }
      return { success: false, error: '未找到该形象' }
    } catch (err) {
      console.error('[DesktopPet] 更新形象失败:', err)
      return { success: false, error: '更新形象失败' }
    }
  })

  // ========== 系统动作相关 ==========

  // 获取系统动作配置
  ipcMain.handle('desktopPet:getSystemActions', () => {
    const systemActions = getSystemActions()
    return { success: true, systemActions }
  })

  // 保存系统动作配置
  ipcMain.handle('desktopPet:saveSystemActions', (_event, systemActions: SystemActionConfig[]) => {
    try {
      saveSystemActions(systemActions)
      console.log('[DesktopPet] 保存系统动作配置成功')
      // 通知化身窗口更新系统动作配置
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('desktopPet:systemActionsUpdated', { systemActions })
        console.log('[DesktopPet] 发送系统动作更新事件到化身窗口')
      }
      return { success: true }
    } catch (err) {
      console.error('[DesktopPet] 保存系统动作配置失败:', err)
      return { success: false, error: '保存系统动作配置失败' }
    }
  })

  // ========== 视频生成相关 ==========

  // 获取 API Key（agiyiya.com）
  function getVideoApiKey(): string | null {
    try {
      const envPath = path.join(app.getPath('home'), '.openclaw', '.env')
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8')
        const match = content.match(/AGIYIYA_API_KEY\s*=\s*(.+)/)
        if (match) {
          return match[1].trim().replace(/^["']|["']$/g, '')
        }
      }
    } catch (err) {
      console.error('[DesktopPet] 读取 API Key 失败:', err)
    }
    return null
  }

  // 支持的比例
  const SUPPORTED_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1'] as const
  type AspectRatio = typeof SUPPORTED_ASPECT_RATIOS[number]

  // 根据图片尺寸计算最接近的比例
  function getClosestAspectRatio(width: number, height: number): AspectRatio {
    const ratio = width / height

    const ratioValues: Record<AspectRatio, number> = {
      '16:9': 16 / 9,
      '9:16': 9 / 16,
      '4:3': 4 / 3,
      '3:4': 3 / 4,
      '1:1': 1,
    }

    let closestRatio: AspectRatio = '1:1'
    let minDiff = Math.abs(ratio - 1)

    for (const [ar, value] of Object.entries(ratioValues)) {
      const diff = Math.abs(ratio - value)
      if (diff < minDiff) {
        minDiff = diff
        closestRatio = ar as AspectRatio
      }
    }

    return closestRatio
  }

  // 从 base64 图片数据获取尺寸
  function getImageDimensions(base64Data: string): { width: number; height: number } | null {
    try {
      const buffer = Buffer.from(base64Data, 'base64')

      // PNG: 前8字节是签名，然后是 IHDR chunk
      if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        const width = buffer.readUInt32BE(16)
        const height = buffer.readUInt32BE(20)
        return { width, height }
      }

      // JPEG: 查找 SOF0 标记
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2
        while (offset < buffer.length - 4) {
          if (buffer[offset] !== 0xff) {
            offset++
            continue
          }
          const marker = buffer[offset + 1]
          // SOF0, SOF1, SOF2 标记
          if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
            const height = buffer.readUInt16BE(offset + 5)
            const width = buffer.readUInt16BE(offset + 7)
            return { width, height }
          }
          offset += 2 + buffer.readUInt16BE(offset + 2)
        }
      }

      // WebP: RIFF 头 + VP8
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        const width = buffer.readUInt16LE(26)
        const height = buffer.readUInt16LE(28)
        return { width, height }
      }

      return null
    } catch {
      return null
    }
  }

  // 生成绿色背景图片（调用图片生成 API）
  async function generateGreenBackgroundImage(
    baseUrl: string,
    apiKey: string,
    imageUrl: string,
    aspectRatio: AspectRatio
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    console.log('[DesktopPet] 正在生成绿色背景图片...')

    // 1. 提交图片生成任务
    const submitPayload = JSON.stringify({
      prompt: '将图片背景变成纯绿色(#00FF00)，保持主体内容不变',
      model: 'gemini-3-pro-image-preview',
      aspect_ratio: aspectRatio,
      n: 1,
      resolution: '1K',
      image_urls: [imageUrl],
    })

    const submitResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
      const req = https.request(
        `${baseUrl}/api/image/generate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => {
            try {
              const data = JSON.parse(body)
              if (data.code && data.code !== 200 && !data.data) {
                resolve({ success: false, error: data.error?.message || data.message || JSON.stringify(data) })
              } else {
                resolve({ success: true, data })
              }
            } catch {
              resolve({ success: false, error: '解析响应失败' })
            }
          })
        }
      )
      req.on('error', (err) => resolve({ success: false, error: err.message }))
      req.write(submitPayload)
      req.end()
    })

    if (!submitResult.success) {
      return { success: false, error: submitResult.error }
    }

    // 打印完整响应用于调试
    console.log('[DesktopPet] 图片生成 API 原始响应:', JSON.stringify(submitResult.data))

    const responseData = submitResult.data as { data?: { tasks?: Array<{ task_id: string }> } }
    const tasks = responseData?.data?.tasks || []
    if (tasks.length === 0) {
      return { success: false, error: '图片生成 API 未返回任务 ID' }
    }

    const taskId = tasks[0].task_id
    console.log('[DesktopPet] 图片生成任务已提交:', taskId)

    // 2. 轮询任务状态
    const pollInterval = 3000
    const pollTimeout = 120000 // 2分钟
    const startTime = Date.now()

    while (Date.now() - startTime < pollTimeout) {
      await new Promise((r) => setTimeout(r, pollInterval))

      const taskResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
        const req = https.request(
          `${baseUrl}/api/image/task/${taskId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              try {
                const data = JSON.parse(body)
                resolve({ success: true, data })
              } catch {
                resolve({ success: false, error: '解析响应失败' })
              }
            })
          }
        )
        req.on('error', (err) => resolve({ success: false, error: err.message }))
        req.end()
      })

      if (!taskResult.success) {
        return { success: false, error: taskResult.error }
      }

      interface ImageTaskResponse {
        data?: {
          status?: string
          result?: {
            images?: Array<{ url?: string }>
          }
        }
      }
      const taskData = taskResult.data as ImageTaskResponse
      const status = taskData?.data?.status?.toLowerCase() || ''

      console.log('[DesktopPet] 图片生成任务状态:', status)

      if (status === 'completed' || status === 'succeeded') {
        const images = taskData?.data?.result?.images || []
        if (images.length > 0 && images[0].url) {
          // url 可能是字符串或数组
          const url = Array.isArray(images[0].url) ? images[0].url[0] : images[0].url
          console.log('[DesktopPet] 绿色背景图片生成成功:', url)
          return { success: true, url }
        }
        return { success: false, error: '图片生成完成但未返回图片 URL' }
      } else if (status === 'failed' || status === 'cancelled') {
        return { success: false, error: `图片生成任务${status}` }
      }
    }

    return { success: false, error: '图片生成超时' }
  }

  // 生成视频（图生视频）- 使用 agiyiya.com API
  ipcMain.handle('desktopPet:generateVideo', async (_event, params: { imageDataUrl: string; prompt: string; duration?: number; aspectRatio?: string }) => {
    const apiKey = getVideoApiKey()
    if (!apiKey) {
      return { success: false, error: '未配置 AGIYIYA_API_KEY，请在设置中添加环境变量' }
    }

    const { imageDataUrl, prompt, duration = 2, aspectRatio: providedAspectRatio } = params
    const baseUrl = 'https://agiyiya.com'

    // 解析 base64 获取图片尺寸
    const matches = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      return { success: false, error: '无效的图片数据格式' }
    }
    const base64Data = matches[2]
    const dimensions = getImageDimensions(base64Data)
    // 优先使用前端传入的比例，否则从图片尺寸计算
    const aspectRatio = providedAspectRatio || (dimensions
      ? getClosestAspectRatio(dimensions.width, dimensions.height)
      : '1:1')
    console.log('[DesktopPet] 图片尺寸:', dimensions, '比例:', aspectRatio)

    try {
      // 1. 先上传图片获取 URL
      console.log('[DesktopPet] 正在上传图片...')
      const ext = matches[1]
      const buffer = Buffer.from(base64Data, 'base64')

      const uploadResult = await new Promise<{ success: boolean; url?: string; error?: string }>((resolve) => {
        // 构建 multipart/form-data 请求
        const boundary = `----FormBoundary${Date.now()}`
        const filename = `image.${ext}`
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`

        const formDataParts = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: ${mimeType}`,
          '',
        ]
        const footer = `\r\n--${boundary}--\r\n`

        const headerBuffer = Buffer.from(formDataParts.join('\r\n') + '\r\n', 'utf8')
        const footerBuffer = Buffer.from(footer, 'utf8')
        const totalLength = headerBuffer.length + buffer.length + footerBuffer.length

        const req = https.request(
          `${baseUrl}/api/ai/upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': totalLength,
            },
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              try {
                const data = JSON.parse(body)
                if (data.success && (data.data?.url || data.data?.signed_url)) {
                  resolve({ success: true, url: data.data.signed_url || data.data.url })
                } else {
                  resolve({ success: false, error: data.message || data.detail || '上传失败' })
                }
              } catch {
                resolve({ success: false, error: '解析上传响应失败: ' + body.substring(0, 200) })
              }
            })
          }
        )
        req.on('error', (err) => resolve({ success: false, error: err.message }))

        // 分段写入
        req.write(headerBuffer)
        req.write(buffer)
        req.write(footerBuffer)
        req.end()
      })

      if (!uploadResult.success || !uploadResult.url) {
        return { success: false, error: `图片上传失败: ${uploadResult.error}` }
      }

      const imageUrl = uploadResult.url
      console.log('[DesktopPet] 图片上传成功:', imageUrl)

      // 2. 生成绿色背景图片
      const greenBgResult = await generateGreenBackgroundImage(baseUrl, apiKey, imageUrl, aspectRatio)
      let finalImageUrl = imageUrl

      if (greenBgResult.success && greenBgResult.url) {
        finalImageUrl = greenBgResult.url
        console.log('[DesktopPet] 使用绿色背景图片生成视频')
      } else {
        console.log('[DesktopPet] 绿色背景生成失败，使用原图:', greenBgResult.error)
      }

      // 3. 提交视频生成任务
      const submitPayload = JSON.stringify({
        model: 'doubao-seedance-1-0-pro-fast',
        prompt: prompt || '角色做简单的呼吸动作，身体轻微起伏',
        image_urls: [finalImageUrl],
        duration: Math.min(Math.max(duration, 1), 10), // 限制1-10秒
        resolution: '1080p',
        aspect_ratio: aspectRatio,
      })

      const submitResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
        const req = https.request(
          `${baseUrl}/api/video/generate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              try {
                const data = JSON.parse(body)
                if (data.code && data.code !== 200 && !data.data) {
                  resolve({ success: false, error: data.error?.message || data.message || JSON.stringify(data) })
                } else {
                  resolve({ success: true, data })
                }
              } catch {
                resolve({ success: false, error: '解析响应失败' })
              }
            })
          }
        )
        req.on('error', (err) => resolve({ success: false, error: err.message }))
        req.write(submitPayload)
        req.end()
      })

      if (!submitResult.success) {
        return { success: false, error: submitResult.error }
      }

      const responseData = submitResult.data as { data?: { tasks?: Array<{ task_id: string }> } }
      const tasks = responseData?.data?.tasks || []
      if (tasks.length === 0) {
        return { success: false, error: 'API 未返回任务 ID' }
      }

      const taskId = tasks[0].task_id
      console.log('[DesktopPet] 视频任务已提交:', taskId)

      // 2. 轮询任务状态
      const pollInterval = 3000
      const pollTimeout = 600000 // 10分钟
      const startTime = Date.now()

      while (Date.now() - startTime < pollTimeout) {
        await new Promise((r) => setTimeout(r, pollInterval))

        const taskResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
          const req = https.request(
            `${baseUrl}/api/video/task/${taskId}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
              },
            },
            (res) => {
              let body = ''
              res.on('data', (chunk) => (body += chunk))
              res.on('end', () => {
                try {
                  const data = JSON.parse(body)
                  resolve({ success: true, data })
                } catch {
                  resolve({ success: false, error: '解析响应失败' })
                }
              })
            }
          )
          req.on('error', (err) => resolve({ success: false, error: err.message }))
          req.end()
        })

        if (!taskResult.success) {
          return { success: false, error: taskResult.error }
        }

        // 解析响应数据
        interface TaskResponse {
          success?: boolean
          data?: {
            id?: string
            status?: string
            progress?: number
            result?: {
              videos?: Array<{ url?: string | string[] }>
              thumbnail_url?: string
            }
          }
        }
        const taskData = taskResult.data as TaskResponse
        const data = taskData?.data
        const status = data?.status?.toLowerCase() || ''

        console.log('[DesktopPet] 任务状态:', status, '进度:', data?.progress)

        if (status === 'completed') {
          // 提取视频 URL
          const videos = data?.result?.videos || []
          if (videos.length === 0) {
            return { success: false, error: '视频生成完成但未返回视频 URL' }
          }

          let videoUrl = videos[0].url
          if (Array.isArray(videoUrl)) {
            videoUrl = videoUrl[0]
          }

          if (!videoUrl) {
            return { success: false, error: '视频 URL 为空' }
          }

          console.log('[DesktopPet] 视频URL:', videoUrl)

          // 3. 下载视频
          const videoBuffer = await new Promise<Buffer | null>((resolve) => {
            https.get(videoUrl, (res) => {
              const chunks: Buffer[] = []
              res.on('data', (chunk) => chunks.push(chunk))
              res.on('end', () => resolve(Buffer.concat(chunks)))
              res.on('error', () => resolve(null))
            }).on('error', () => resolve(null))
          })

          if (!videoBuffer) {
            return { success: false, error: '视频下载失败' }
          }

          // 4. 保存视频并转换为 GIF
          const imagesDir = getPetImagesDir()
          const videoPath = path.join(imagesDir, `video-${taskId}.mp4`)
          fs.writeFileSync(videoPath, videoBuffer)

          // 转换为 GIF（使用配置的抠图参数）
          const gifPath = path.join(imagesDir, `pet-${taskId}.gif`)
          const config = getPetConfig()
          const gifResult = await convertVideoToGif(videoPath, gifPath, {
            color: config.chromakeyColor,
            similarity: config.chromakeySimilarity,
            blend: config.chromakeyBlend,
          })

          // 删除临时视频文件
          if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath)
          }

          if (gifResult.success && gifResult.path) {
            // GIF 已经通过 chroma key 处理了绿色背景透明
            // 读取 GIF 转为 base64
            const gifData = fs.readFileSync(gifResult.path)
            const gifBase64 = `data:image/gif;base64,${gifData.toString('base64')}`
            return { success: true, gifPath: gifResult.path, gifDataUrl: gifBase64 }
          } else {
            return { success: false, error: gifResult.error || 'GIF 转换失败' }
          }
        } else if (status === 'failed' || status === 'cancelled') {
          return { success: false, error: `任务${status}` }
        }
      }

      return { success: false, error: '视频生成超时' }
    } catch (err) {
      console.error('[DesktopPet] 视频生成失败:', err)
      return { success: false, error: String(err) }
    }
  })
}

// 视频转 GIF（使用 ffmpeg，带绿幕抠图）
async function convertVideoToGif(
  videoPath: string,
  outputPath: string,
  options?: { color?: string; similarity?: number; blend?: number }
): Promise<{ success: boolean; path?: string; error?: string }> {
  const color = options?.color || '0x00FF00'
  const similarity = options?.similarity ?? 0.27
  const blend = options?.blend ?? 0.1

  return new Promise((resolve) => {
    // 生成调色板以提高 GIF 质量
    const palettePath = videoPath.replace('.mp4', '-palette.png')

    // 第一步：生成带透明通道的调色板
    // 使用 chroma key 将绿色变透明
    const paletteProcess = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `fps=10,scale=512:-1:flags=lanczos,chromakey=${color}:${similarity}:${blend},palettegen=reserve_transparent=1`,
      '-y',
      palettePath,
    ])

    let paletteStderr = ''
    paletteProcess.stderr?.on('data', (data) => {
      paletteStderr += data.toString()
    })

    paletteProcess.on('close', (paletteCode) => {
      if (paletteCode !== 0) {
        // 如果调色板生成失败，尝试直接转换（无透明）
        console.log('[DesktopPet] 调色板生成失败，尝试直接转换')
        const directProcess = spawn('ffmpeg', [
          '-i', videoPath,
          '-vf', `fps=10,scale=512:-1:flags=lanczos,chromakey=${color}:${similarity}:${blend}`,
          '-y',
          outputPath,
        ])
        directProcess.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve({ success: true, path: outputPath })
          } else {
            resolve({ success: false, error: 'FFmpeg 转换失败，请确保已安装 ffmpeg' })
          }
        })
        return
      }

      // 第二步：使用调色板生成透明 GIF
      // chroma key 将绿色变透明，paletteuse 应用调色板
      const gifProcess = spawn('ffmpeg', [
        '-i', videoPath,
        '-i', palettePath,
        '-lavfi', `[0:v]fps=10,scale=512:-1:flags=lanczos,chromakey=${color}:${similarity}:${blend}[s];[s][1:v]paletteuse=alpha_threshold=128`,
        '-loop', '0',
        '-y',
        outputPath,
      ])

      let gifStderr = ''
      gifProcess.stderr?.on('data', (data) => {
        gifStderr += data.toString()
      })

      gifProcess.on('close', (code) => {
        // 清理调色板文件
        if (fs.existsSync(palettePath)) {
          fs.unlinkSync(palettePath)
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ success: true, path: outputPath })
        } else {
          resolve({ success: false, error: 'FFmpeg 转换失败' })
        }
      })

      gifProcess.on('error', (err) => {
        console.error('[DesktopPet] FFmpeg 进程错误:', err)
        // 清理调色板文件
        if (fs.existsSync(palettePath)) {
          fs.unlinkSync(palettePath)
        }
        resolve({ success: false, error: 'FFmpeg 未安装或执行失败' })
      })
    })

    paletteProcess.on('error', (err) => {
      console.error('[DesktopPet] FFmpeg 进程错误:', err)
      resolve({ success: false, error: 'FFmpeg 未安装或执行失败，请安装 ffmpeg 并添加到 PATH' })
    })
  })
}

// 去除 GIF 背景（使用 rembg）
async function removeGifBackground(gifPath: string, outputPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
  const tempDir = path.join(path.dirname(gifPath), `frames-${Date.now()}`)

  try {
    // 1. 创建临时目录
    fs.mkdirSync(tempDir, { recursive: true })

    // 2. 用 ffmpeg 拆帧
    const framesPattern = path.join(tempDir, 'frame_%04d.png')
    await new Promise<void>((resolve, reject) => {
      const extractProcess = spawn('ffmpeg', [
        '-i', gifPath,
        '-vsync', '0',
        framesPattern,
      ])
      extractProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`拆帧失败，退出码: ${code}`))
      })
      extractProcess.on('error', reject)
    })

    // 3. 获取所有帧文件
    const frameFiles = fs.readdirSync(tempDir)
      .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
      .sort()

    if (frameFiles.length === 0) {
      return { success: false, error: '拆帧失败，未生成任何帧' }
    }

    console.log(`[DesktopPet] 拆帧完成，共 ${frameFiles.length} 帧`)

    // 4. 用 rembg 处理每帧
    const processedDir = path.join(tempDir, 'processed')
    fs.mkdirSync(processedDir, { recursive: true })

    for (let i = 0; i < frameFiles.length; i++) {
      const frameFile = frameFiles[i]
      const inputPath = path.join(tempDir, frameFile)
      const outputFrameFile = `frame_${String(i).padStart(4, '0')}.png`
      const outputFramePath = path.join(processedDir, outputFrameFile)

      // 调用 rembg 库去除背景（使用 birefnet-general 模型，对白色头发等细节处理更好）
      await new Promise<void>((resolve) => {
        const pythonScript = `
from rembg import remove, new_session
from PIL import Image
import sys

try:
    input_path = r"${inputPath.replace(/\\/g, '\\')}"
    output_path = r"${outputFramePath.replace(/\\/g, '\\')}"

    with open(input_path, 'rb') as f:
        input_data = f.read()

    # 使用 birefnet-general 模型，对白色头发等细节处理更好
    session = new_session('birefnet-general')
    output_data = remove(input_data, session=session)

    with open(output_path, 'wb') as f:
        f.write(output_data)

    print("OK")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`
        const rembgProcess = spawn('python', ['-c', pythonScript])
        let stderr = ''
        rembgProcess.stderr?.on('data', (data) => {
          stderr += data.toString()
        })
        rembgProcess.on('close', (code) => {
          if (code === 0) resolve()
          else {
            console.error(`[DesktopPet] rembg 处理帧 ${frameFile} 失败:`, stderr)
            // 如果 rembg 失败，复制原帧（保持流程继续）
            try {
              fs.copyFileSync(inputPath, outputFramePath)
            } catch {}
            resolve()
          }
        })
        rembgProcess.on('error', (err) => {
          console.error(`[DesktopPet] rembg 进程错误:`, err)
          // 复制原帧继续
          try {
            fs.copyFileSync(inputPath, outputFramePath)
          } catch {}
          resolve()
        })
      })
    }

    console.log(`[DesktopPet] rembg 处理完成`)

    // 5. 重新合成透明 GIF
    const processedPattern = path.join(processedDir, 'frame_%04d.png')
    await new Promise<void>((resolve, reject) => {
      const gifProcess = spawn('ffmpeg', [
        '-framerate', '10',
        '-i', processedPattern,
        '-lavfi', 'palettegen=reserve_transparent=1[p];[0:v][p]paletteuse=alpha_threshold=128',
        '-loop', '0',
        '-y',
        outputPath,
      ])
      let stderr = ''
      gifProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      gifProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`合成 GIF 失败: ${stderr}`))
      })
      gifProcess.on('error', reject)
    })

    // 6. 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true })

    if (fs.existsSync(outputPath)) {
      console.log(`[DesktopPet] 透明 GIF 生成成功: ${outputPath}`)
      return { success: true, path: outputPath }
    } else {
      return { success: false, error: 'GIF 合成失败' }
    }
  } catch (err) {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    console.error('[DesktopPet] 去除背景失败:', err)
    return { success: false, error: `去除背景失败: ${err}` }
  }
}

// 检查 rembg 是否可用
async function checkRembgAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const checkProcess = spawn('python', ['-c', 'from rembg import remove, new_session; new_session("birefnet-general"); print("OK")'])
    let stdout = ''
    checkProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    checkProcess.on('close', (code) => {
      resolve(code === 0 && stdout.includes('OK'))
    })
    checkProcess.on('error', () => {
      resolve(false)
    })
  })
}
