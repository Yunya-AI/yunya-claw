import { clipboard, globalShortcut, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

export interface ClipboardRecord {
  id: string
  text: string
  timestamp: number
  screenshotFile?: string
  sourceApp?: string
  analysis?: string
  pinned?: boolean
  tags?: string[]
}

interface ClipboardMonitorOptions {
  configDir: string
  pollInterval?: number
  maxRecords?: number
  onNewRecord?: (record: ClipboardRecord) => void
}

const DEFAULT_POLL_INTERVAL = 800
const DEFAULT_MAX_RECORDS = 500

export class ClipboardMonitor {
  private configDir: string
  private historyDir: string
  private screenshotDir: string
  private recordsPath: string
  private configPath: string
  private records: ClipboardRecord[] = []
  private lastText = ''
  private timer: ReturnType<typeof setInterval> | null = null
  private pollInterval: number
  private maxRecords: number
  private onNewRecord?: (record: ClipboardRecord) => void
  private enabled = false
  private polling = false // 防止并发 poll

  constructor(options: ClipboardMonitorOptions) {
    this.configDir = options.configDir
    this.historyDir = path.join(this.configDir, 'clipboard-history')
    this.screenshotDir = path.join(this.historyDir, 'screenshots')
    this.recordsPath = path.join(this.historyDir, 'records.json')
    this.configPath = path.join(this.historyDir, 'config.json')
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS
    this.onNewRecord = options.onNewRecord
  }

  /** 确保存储目录存在 */
  private ensureDirs(): void {
    if (!fs.existsSync(this.historyDir)) fs.mkdirSync(this.historyDir, { recursive: true })
    if (!fs.existsSync(this.screenshotDir)) fs.mkdirSync(this.screenshotDir, { recursive: true })
  }

  /** 加载配置 */
  private loadConfig(): { enabled: boolean } {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        return JSON.parse(raw)
      }
    } catch {
      // 忽略错误
    }
    return { enabled: false }
  }

  /** 保存配置 */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify({ enabled: this.enabled }, null, 2), 'utf-8')
    } catch (err) {
      console.error('[ClipboardMonitor] 保存配置失败:', err)
    }
  }

  /** 恢复上次的启用状态 */
  restoreState(): void {
    const config = this.loadConfig()
    if (config.enabled) {
      this.start()
    }
  }

  /** 加载已有记录 */
  private loadRecords(): void {
    try {
      if (fs.existsSync(this.recordsPath)) {
        const raw = fs.readFileSync(this.recordsPath, 'utf-8')
        this.records = JSON.parse(raw)
      }
    } catch {
      this.records = []
    }
  }

  /** 持久化记录 */
  private saveRecords(): void {
    try {
      fs.writeFileSync(this.recordsPath, JSON.stringify(this.records, null, 2), 'utf-8')
    } catch (err) {
      console.error('[ClipboardMonitor] 保存记录失败:', err)
    }
  }

  /** 截取当前屏幕 */
  private async captureScreen(): Promise<string | undefined> {
    // 整体保护，确保任何异常都不会导致崩溃
    try {
      const fileName = `screenshot-${Date.now()}.png`
      const filePath = path.join(this.screenshotDir, fileName)

      // 确保目录存在
      if (!fs.existsSync(this.screenshotDir)) {
        fs.mkdirSync(this.screenshotDir, { recursive: true })
      }

      if (process.platform === 'win32') {
        // Windows: 用 PowerShell 截图
        const safePath = filePath.replace(/\\/g, '\\\\')
        const psCmd = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try {
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen
  $bounds = $screen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Width, $bounds.Height)
  $bitmap.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
} catch {
  exit 1
}
`
        await new Promise<void>((resolve) => {
          let settled = false
          const done = () => {
            if (settled) return
            settled = true
            resolve()
          }

          // 设置超时保护
          const timeout = setTimeout(done, 5000)

          try {
            const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
              detached: false,
            })

            let stderr = ''
            ps.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
            ps.on('close', (code) => {
              clearTimeout(timeout)
              if (code !== 0) {
                console.warn('[ClipboardMonitor] PowerShell 截图失败:', code, stderr.slice(0, 200))
              }
              done()
            })
            ps.on('error', (err) => {
              clearTimeout(timeout)
              console.warn('[ClipboardMonitor] PowerShell 启动失败:', err.message)
              done()
            })
          } catch (err) {
            clearTimeout(timeout)
            console.warn('[ClipboardMonitor] PowerShell 执行异常:', err)
            done()
          }
        })
      } else if (process.platform === 'darwin') {
        // macOS: 用 screencapture
        await new Promise<void>((resolve) => {
          const proc = spawn('screencapture', ['-x', filePath], { stdio: ['pipe', 'pipe', 'pipe'] })
          proc.on('close', (code) => {
            if (code === 0 && fs.existsSync(filePath)) {
              resolve()
            } else {
              console.warn('[ClipboardMonitor] screencapture 失败:', code)
              resolve()
            }
          })
          proc.on('error', (err) => {
            console.warn('[ClipboardMonitor] screencapture 启动失败:', err)
            resolve()
          })
        })
      } else {
        // Linux: 用 gnome-screenshot 或 scrot
        await new Promise<void>((resolve) => {
          const proc = spawn('gnome-screenshot', ['-f', filePath], { stdio: ['pipe', 'pipe', 'pipe'] })
          let settled = false
          const done = (ok: boolean) => {
            if (settled) return
            settled = true
            if (ok && fs.existsSync(filePath)) {
              resolve()
            } else {
              // fallback to scrot
              const proc2 = spawn('scrot', [filePath], { stdio: ['pipe', 'pipe', 'pipe'] })
              proc2.on('close', () => resolve())
              proc2.on('error', () => resolve())
            }
          }
          proc.on('close', (code) => done(code === 0))
          proc.on('error', () => done(false))
        })
      }

      return fs.existsSync(filePath) ? fileName : undefined
    } catch (err) {
      console.error('[ClipboardMonitor] 截屏失败:', err)
      return undefined
    }
  }

  /** 轮询检测剪贴板变化 */
  private async poll(): Promise<void> {
    // 防止并发执行
    if (this.polling) return
    this.polling = true

    try {
      const currentText = clipboard.readText()?.trim()
      if (!currentText || currentText === this.lastText) {
        this.polling = false
        return
      }

      this.lastText = currentText

      // 截图操作设置超时，防止卡死
      let screenshotFile: string | undefined
      try {
        screenshotFile = await Promise.race([
          this.captureScreen(),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000))
        ])
      } catch {
        screenshotFile = undefined
      }

      const record: ClipboardRecord = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: currentText,
        timestamp: Date.now(),
        screenshotFile,
      }

      this.records.unshift(record)

      // 限制记录数量
      if (this.records.length > this.maxRecords) {
        const removed = this.records.splice(this.maxRecords)
        // 清理旧截图文件
        for (const r of removed) {
          if (r.screenshotFile) {
            const p = path.join(this.screenshotDir, r.screenshotFile)
            try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* 忽略 */ }
          }
        }
      }

      this.saveRecords()
      this.onNewRecord?.(record)
    } catch (err) {
      console.error('[ClipboardMonitor] 轮询错误:', err)
    } finally {
      this.polling = false
    }
  }

  /** 启动监控 */
  start(): void {
    if (this.timer) return
    this.ensureDirs()
    this.loadRecords()
    // 初始化 lastText 为当前剪贴板内容，避免启动时立即记录已有内容
    this.lastText = clipboard.readText()?.trim() || ''
    this.enabled = true
    this.saveConfig()
    this.timer = setInterval(() => this.poll(), this.pollInterval)
    console.log('[ClipboardMonitor] 已启动')
  }

  /** 停止监控 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.enabled = false
    this.saveConfig()
    console.log('[ClipboardMonitor] 已停止')
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** 获取所有记录 */
  getRecords(): ClipboardRecord[] {
    return this.records
  }

  /** 搜索记录 */
  searchRecords(query: string): ClipboardRecord[] {
    const q = query.toLowerCase()
    return this.records.filter(r =>
      r.text.toLowerCase().includes(q) ||
      r.analysis?.toLowerCase().includes(q) ||
      r.tags?.some(t => t.toLowerCase().includes(q))
    )
  }

  /** 删除记录 */
  deleteRecord(id: string): boolean {
    const idx = this.records.findIndex(r => r.id === id)
    if (idx < 0) return false
    const [removed] = this.records.splice(idx, 1)
    if (removed.screenshotFile) {
      const p = path.join(this.screenshotDir, removed.screenshotFile)
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* 忽略 */ }
    }
    this.saveRecords()
    return true
  }

  /** 清空所有记录 */
  clearAll(): void {
    // 清理所有截图
    for (const r of this.records) {
      if (r.screenshotFile) {
        const p = path.join(this.screenshotDir, r.screenshotFile)
        try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* 忽略 */ }
      }
    }
    this.records = []
    this.saveRecords()
  }

  /** 切换置顶 */
  togglePin(id: string): boolean {
    const record = this.records.find(r => r.id === id)
    if (!record) return false
    record.pinned = !record.pinned
    this.saveRecords()
    return true
  }

  /** 更新记录的 AI 分析结果 */
  updateAnalysis(id: string, analysis: string): boolean {
    const record = this.records.find(r => r.id === id)
    if (!record) return false
    record.analysis = analysis
    this.saveRecords()
    return true
  }

  /** 更新记录标签 */
  updateTags(id: string, tags: string[]): boolean {
    const record = this.records.find(r => r.id === id)
    if (!record) return false
    record.tags = tags
    this.saveRecords()
    return true
  }

  /** 读取截图文件为 data URL */
  getScreenshotDataUrl(fileName: string): string | null {
    const p = path.join(this.screenshotDir, fileName)
    if (!fs.existsSync(p)) return null
    const buffer = fs.readFileSync(p)
    return `data:image/png;base64,${buffer.toString('base64')}`
  }

  /** 写入文本到系统剪贴板 */
  writeToClipboard(text: string): void {
    try {
      clipboard.writeText(text)
      this.lastText = text.trim()
    } catch (err) {
      console.error('[ClipboardMonitor] 写入剪贴板失败:', err)
    }
  }
}

// ---- IPC 注册 ----

/** 模拟 Ctrl+V 粘贴 */
function simulatePaste(prevHwnd?: number): void {
  try {
    if (process.platform === 'win32') {
      // Windows: 先激活之前的窗口，再发送 Ctrl+V
      let psCmd: string
      if (prevHwnd) {
        psCmd = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
              [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            }
"@
          Add-Type -AssemblyName System.Windows.Forms
          # 激活之前的窗口
          [Win32]::ShowWindow([IntPtr]${prevHwnd}, 9)
          [Win32]::SetForegroundWindow([IntPtr]${prevHwnd})
          Start-Sleep -Milliseconds 100
          # 发送 Ctrl+V
          [System.Windows.Forms.SendKeys]::SendWait("^v")
        `
      } else {
        psCmd = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("^v")
        `
      }
      console.log('[ClipboardMonitor] 正在执行 PowerShell SendKeys...')
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        windowsHide: true,
      })
      ps.on('error', (err) => {
        console.error('[ClipboardMonitor] PowerShell 执行失败:', err)
      })
      ps.on('close', (code) => {
        console.log('[ClipboardMonitor] PowerShell 退出，代码:', code)
      })
      ps.stderr?.on('data', (data) => {
        console.error('[ClipboardMonitor] PowerShell stderr:', data.toString())
      })
    } else if (process.platform === 'darwin') {
      // macOS: 使用 osascript
      spawn('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
      console.log('[ClipboardMonitor] 已发送 Cmd+V')
    } else {
      // Linux: 使用 xdotool
      spawn('xdotool', ['key', 'ctrl+v'])
      console.log('[ClipboardMonitor] 已发送 Ctrl+V')
    }
  } catch (err) {
    console.error('[ClipboardMonitor] 模拟粘贴失败:', err)
  }
}

export function registerClipboardIpc(monitor: ClipboardMonitor): void {
  ipcMain.handle('clipboard:getRecords', (_event, query?: string) => {
    try {
      const records = query ? monitor.searchRecords(query) : monitor.getRecords()
      return { success: true, records }
    } catch (err) {
      return { success: false, records: [], error: String(err) }
    }
  })

  ipcMain.handle('clipboard:deleteRecord', (_event, id: string) => {
    try {
      const ok = monitor.deleteRecord(id)
      return { success: ok, error: ok ? undefined : '记录不存在' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:clearAll', () => {
    try {
      monitor.clearAll()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:togglePin', (_event, id: string) => {
    try {
      const ok = monitor.togglePin(id)
      return { success: ok }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:getScreenshot', (_event, fileName: string) => {
    try {
      const dataUrl = monitor.getScreenshotDataUrl(fileName)
      return { success: !!dataUrl, dataUrl }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:paste', async (_event, text: string) => {
    try {
      // 写入剪贴板
      monitor.writeToClipboard(text)
      console.log('[ClipboardMonitor] 已写入剪贴板')

      // 保存窗口句柄，然后隐藏窗口
      const prevHwnd = lastForegroundHwnd
      if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
        quickPasteWindow.hide()
      }

      // 延迟后模拟 Ctrl+V 粘贴（恢复到之前的窗口）
      setTimeout(() => {
        simulatePaste(prevHwnd || undefined)
      }, 300)

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:toggleMonitor', (_event, enable: boolean) => {
    try {
      if (enable) {
        monitor.start()
      } else {
        monitor.stop()
      }
      return { success: true, enabled: monitor.isEnabled() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clipboard:status', () => {
    return { success: true, enabled: monitor.isEnabled() }
  })

  ipcMain.handle('clipboard:updateAnalysis', (_event, id: string, analysis: string) => {
    try {
      const ok = monitor.updateAnalysis(id, analysis)
      return { success: ok }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}

// ---- 快捷粘贴窗口 ----

let quickPasteWindow: BrowserWindow | null = null
let lastForegroundHwnd: number | null = null
let clipboardMonitorInstance: ClipboardMonitor | null = null

export function setClipboardMonitorInstance(monitor: ClipboardMonitor): void {
  clipboardMonitorInstance = monitor
}

/** 获取当前前台窗口句柄 (Windows only) */
async function getForegroundWindowHandle(): Promise<number | null> {
  if (process.platform !== 'win32') return null
  return new Promise((resolve) => {
    const psCmd = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        }
"@
      [Win32]::GetForegroundWindow()
    `
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      windowsHide: true,
    })
    let output = ''
    ps.stdout?.on('data', (data) => { output += data.toString() })
    ps.on('close', () => {
      const hwnd = parseInt(output.trim(), 10)
      resolve(isNaN(hwnd) ? null : hwnd)
    })
    ps.on('error', () => resolve(null))
  })
}

export async function createQuickPasteWindow(mainWindow: BrowserWindow | null): Promise<BrowserWindow> {
  if (quickPasteWindow && !quickPasteWindow.isDestroyed()) {
    // 记录当前前台窗口
    lastForegroundHwnd = await getForegroundWindowHandle()
    console.log('[ClipboardMonitor] 记录前台窗口句柄:', lastForegroundHwnd)
    quickPasteWindow.show()
    quickPasteWindow.focus()
    // 通知页面重置状态
    quickPasteWindow.webContents.send('quickpaste:show')
    return quickPasteWindow
  }

  // 记录当前前台窗口（在创建新窗口之前）
  lastForegroundHwnd = await getForegroundWindowHandle()
  console.log('[ClipboardMonitor] 记录前台窗口句柄:', lastForegroundHwnd)

  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  quickPasteWindow = new BrowserWindow({
    width: 900,
    height: 560,
    x: Math.round((screenWidth - 900) / 2),
    y: Math.round((screenHeight - 560) / 2),
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a1a',
    show: false,
    webPreferences: {
      preload: mainWindow?.webContents?.session
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 加载与主窗口相同的 URL，但带上 quickpaste 参数
  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
  if (VITE_DEV_SERVER_URL) {
    quickPasteWindow.loadURL(`${VITE_DEV_SERVER_URL}?mode=quickpaste`)
  } else {
    const distIndex = path.join(process.env.DIST!, 'index.html')
    quickPasteWindow.loadFile(distIndex, { query: { mode: 'quickpaste' } })
  }

  quickPasteWindow.once('ready-to-show', () => {
    quickPasteWindow?.show()
    quickPasteWindow?.focus()
  })

  quickPasteWindow.on('blur', () => {
    // 延迟隐藏，避免与点击操作冲突
    setTimeout(() => {
      try {
        if (quickPasteWindow && !quickPasteWindow.isDestroyed() && quickPasteWindow.isVisible()) {
          quickPasteWindow.hide()
        }
      } catch {
        // 忽略已销毁的窗口错误
      }
    }, 100)
  })

  quickPasteWindow.on('closed', () => {
    quickPasteWindow = null
  })

  return quickPasteWindow
}

export async function toggleQuickPasteWindow(mainWindow: BrowserWindow | null): Promise<void> {
  // 检查剪贴板监控是否启用
  if (!clipboardMonitorInstance?.isEnabled()) {
    console.log('[ClipboardMonitor] 监控未启用，忽略 Alt+V')
    return
  }

  if (quickPasteWindow && !quickPasteWindow.isDestroyed() && quickPasteWindow.isVisible()) {
    quickPasteWindow.hide()
  } else {
    await createQuickPasteWindow(mainWindow)
  }
}

export function registerQuickPasteShortcut(mainWindow: BrowserWindow | null): void {
  try {
    globalShortcut.register('Alt+V', async () => {
      await toggleQuickPasteWindow(mainWindow)
    })
  } catch (err) {
    console.error('[ClipboardMonitor] 注册快捷键失败:', err)
  }
}

export function unregisterQuickPasteShortcut(): void {
  try {
    globalShortcut.unregister('Alt+V')
  } catch { /* 忽略 */ }
}
