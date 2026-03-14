import { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeImage } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import https from 'node:https'
import http from 'node:http'
import { ensurePlugin } from './bundled-plugins'
import { ensureBundledSkills } from './bundled-skills'
import { runAllMigrations } from './config-migration'
import { stripUserMessageForDisplay } from '../src/lib/chat-utils'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (format: string, options?: { zlib?: { level?: number } }) => {
  file: (path: string, data?: { name?: string }) => unknown
  finalize: () => void
  pipe: (dest: NodeJS.WritableStream) => unknown
  on: (event: string, fn: (err: Error) => void) => unknown
}

// Windows 下强制 stdout/stderr 使用 UTF-8，避免中文乱码
if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stdout as any).setEncoding?.('utf8')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr as any).setEncoding?.('utf8')
  } catch { /* 忽略 */ }
}

/** 调试模式：OPENCLAW_DEBUG=1 时启用 DevTools、详细日志 */
const DEBUG_MODE = process.env.OPENCLAW_DEBUG === '1' || process.env.OPENCLAW_DEBUG === 'true'

/** 写入调试日志到 ~/.openclaw/yunya-claw-debug.log */
function debugLog(...args: unknown[]) {
  try {
    const logDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw')
    const logPath = path.join(logDir, 'yunya-claw-debug.log')
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`
    fs.appendFileSync(logPath, line)
  } catch { /* 忽略 */ }
}

// 全局未捕获异常写入调试日志
process.on('uncaughtException', (err) => {
  debugLog('[uncaughtException]', err?.message, err?.stack)
  if (DEBUG_MODE) console.error('[uncaughtException]', err)
})

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
let gatewayProcess: ChildProcess | null = null
let gatewayStarting = false
let gatewayPort = 18789

/** 接入相关子进程（ensurePlugin、runChannelsAdd），退出时统一清理避免残留 */
const integrationChildren = new Set<ChildProcess>()

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

/** 默认 Provider 配置路径（src/config/default-providers.json） */
function getDefaultProvidersConfigPath(): string {
  return path.join(__dirname, '..', 'src', 'config', 'default-providers.json')
}

type DefaultProvidersConfig = {
  providerKeys: string[]
  providers: Record<string, Record<string, unknown>>
}

const FALLBACK_DEFAULT_PROVIDERS: Record<string, Record<string, unknown>> = {
  bailian: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    api: 'openai-completions',
    models: [
      { id: 'qwen3.5-plus', name: 'qwen3.5-plus（文本/图片）', reasoning: false, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 65536 },
      { id: 'qwen3-max', name: 'qwen3-max', reasoning: false, input: ['text'], contextWindow: 262144, maxTokens: 32768 },
    ],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    api: 'openai-completions',
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner（推理）', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 65536 },
    ],
  },
}

function loadDefaultProvidersConfig(): DefaultProvidersConfig {
  const configPath = getDefaultProvidersConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')
      const parsed = JSON.parse(raw) as DefaultProvidersConfig
      if (parsed?.providerKeys && Array.isArray(parsed.providerKeys) && parsed?.providers && typeof parsed.providers === 'object') {
        return parsed
      }
    }
  } catch (err) {
    console.warn('[Config] 读取 default-providers.json 失败，使用内置默认:', err)
  }
  return {
    providerKeys: ['bailian', 'deepseek'],
    providers: FALLBACK_DEFAULT_PROVIDERS, // fallback 不含 website，ensureProviderWebsites 会从 yunyaClaw 或首次写入
  }
}

let cachedDefaultProvidersConfig: DefaultProvidersConfig | null = null

function getDefaultProvidersConfig(): DefaultProvidersConfig {
  if (!cachedDefaultProvidersConfig) {
    cachedDefaultProvidersConfig = loadDefaultProvidersConfig()
  }
  return cachedDefaultProvidersConfig
}

function getOpenclawConfigDir(): string {
  return process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw')
}

function getOpenclawConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH || path.join(getOpenclawConfigDir(), 'openclaw.json')
}

// ---- YunyaClaw 配置服务：统一管理 yunyaClaw.json，避免多服务并发修改冲突 ----

function getYunyaClawConfigPath(): string {
  return path.join(getOpenclawConfigDir(), 'yunyaClaw.json')
}

/** 自定义应用图标存储路径（~/.openclaw/.yunya-claw-icon.png） */
function getAppearanceIconPath(): string {
  return path.join(getOpenclawConfigDir(), '.yunya-claw-icon.png')
}

function readYunyaClawConfigRaw(): Record<string, unknown> {
  const p = getYunyaClawConfigPath()
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, '')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('[YunyaClaw] 读取 yunyaClaw.json 失败:', err)
  }
  return {}
}

function writeYunyaClawConfigRaw(config: Record<string, unknown>): void {
  const p = getYunyaClawConfigPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
}

/** 写操作队列，串行执行避免并发写入冲突 */
let yunyaClawWriteQueue = Promise.resolve<void>(undefined)

const YunyaClawConfigService = {
  /** 读取完整配置（无锁） */
  read(): Record<string, unknown> {
    return readYunyaClawConfigRaw()
  },

  /** 读取指定字段 */
  get<K extends string>(key: K): unknown {
    const cfg = this.read()
    return cfg[key]
  },

  /** 更新部分字段并持久化（串行写，保证原子性） */
  async update(partial: Record<string, unknown>): Promise<void> {
    const prev = yunyaClawWriteQueue
    yunyaClawWriteQueue = prev.then(() => {
      const cfg = readYunyaClawConfigRaw()
      for (const [k, v] of Object.entries(partial)) {
        cfg[k] = v
      }
      writeYunyaClawConfigRaw(cfg)
    })
    await yunyaClawWriteQueue
  },
}

/** 打包时 openclaw 位置：extraResources to: "openclaw/node_modules" → resources/openclaw/node_modules/openclaw */
function getOpenclawProjectRoot(): string {
  if (app.isPackaged) {
    // QClaw 方案：node_modules/openclaw 作为包安装在 resources/openclaw/node_modules/openclaw
    const inNodeModules = path.join(process.resourcesPath, 'openclaw', 'node_modules', 'openclaw')
    if (fs.existsSync(inNodeModules)) return inNodeModules
    // 兼容旧结构：resources/openclaw（直接目录）
    const inResources = path.join(process.resourcesPath, 'openclaw')
    if (fs.existsSync(path.join(inResources, 'openclaw.mjs'))) return inResources
  }
  return path.join(app.getAppPath(), 'openclaw')
}

/** 获取用于 spawn 的 Node 可执行路径：打包时用内置 node.exe，开发时用 PATH 中的 node */
function getNodeExecutablePath(): { nodePath: string; nodeDir?: string } {
  if (app.isPackaged && process.platform === 'win32') {
    const bundled = path.join(process.resourcesPath, 'node-win', 'node.exe')
    const nodeDir = path.dirname(bundled)
    debugLog('[Node] bundled path:', bundled, 'exists:', fs.existsSync(bundled), 'resourcesPath:', process.resourcesPath)
    if (fs.existsSync(bundled)) return { nodePath: bundled, nodeDir }
  }
  return { nodePath: 'node' }
}

function readOpenclawConfig(): Record<string, unknown> {
  const configPath = getOpenclawConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      // 去掉 BOM 头（\uFEFF），避免 JSON.parse 失败
      const raw = fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('[Config] 读取 openclaw.json 失败:', err)
  }
  return {}
}

function writeOpenclawConfig(config: Record<string, unknown>): void {
  const configPath = getOpenclawConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // openclaw 只接受 meta.lastTouchedVersion 和 meta.lastTouchedAt（strict），写入时只保留这两个字段
  const meta = config.meta as Record<string, unknown> | undefined
  const validMeta = {
    lastTouchedVersion: (typeof meta?.lastTouchedVersion === 'string' ? meta.lastTouchedVersion : undefined) ?? 'yunya-claw',
    lastTouchedAt: (typeof meta?.lastTouchedAt === 'string' ? meta.lastTouchedAt : undefined) ?? new Date().toISOString(),
  }
  config = { ...config, meta: validMeta }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  try {
    fs.chmodSync(configPath, 0o600)
  } catch {
    // Windows 上 chmod 可能不生效，忽略
  }
}

function getDefaultProviderKeys(): string[] {
  return getDefaultProvidersConfig().providerKeys
}

function getDefaultProviders(): Record<string, Record<string, unknown>> {
  return getDefaultProvidersConfig().providers
}

/** 内置 Provider 申请 API Key 链接（从 default-providers.json 的 website 字段读取），存于 yunyaClaw.json */
const FALLBACK_PROVIDER_WEBSITES: Record<string, string> = {
  bailian: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key',
  deepseek: 'https://platform.deepseek.com/api_keys',
}

function getBuiltinProviderWebsites(): Record<string, string> {
  const cfg = getDefaultProvidersConfig()
  const out: Record<string, string> = {}
  for (const key of cfg.providerKeys) {
    const url = cfg.providers[key]?.website
    if (typeof url === 'string' && url.trim()) {
      out[key] = url.trim()
    } else if (FALLBACK_PROVIDER_WEBSITES[key]) {
      out[key] = FALLBACK_PROVIDER_WEBSITES[key]
    }
  }
  return out
}

function getDeletedDefaultProviders(): string[] {
  const yc = readYunyaClawConfigRaw()
  const arr = yc.deletedDefaultProviders
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
}

function addDeletedDefaultProvider(providerKey: string): void {
  if (!getDefaultProviderKeys().includes(providerKey)) return
  const deleted = getDeletedDefaultProviders()
  if (deleted.includes(providerKey)) return
  const next = [...deleted, providerKey]
  const cfg = readYunyaClawConfigRaw()
  cfg.deletedDefaultProviders = next
  writeYunyaClawConfigRaw(cfg)
}

function ensureProviderWebsites(): void {
  const yc = readYunyaClawConfigRaw()
  let providerWebsites = yc.providerWebsites as Record<string, string> | undefined
  if (!providerWebsites || typeof providerWebsites !== 'object') {
    providerWebsites = { ...getBuiltinProviderWebsites() }
    yc.providerWebsites = providerWebsites
    writeYunyaClawConfigRaw(yc)
  } else {
    let changed = false
    for (const [key, url] of Object.entries(getBuiltinProviderWebsites())) {
      if (providerWebsites[key] !== url) {
        providerWebsites[key] = url
        changed = true
      }
    }
    if (changed) writeYunyaClawConfigRaw(yc)
  }
}

function ensureDefaultProviders(): void {
  const deleted = getDeletedDefaultProviders()
  const config = readOpenclawConfig()
  const models = (config.models as Record<string, unknown>) || {}
  const providers = (models.providers as Record<string, unknown>) || {}
  let configChanged = false
  const providerEnabledPatch: Record<string, boolean> = {}

  for (const [key, def] of Object.entries(getDefaultProviders())) {
    if (deleted.includes(key)) continue
    if (!providers[key]) {
      const { website: _w, enabled: _e, ...rest } = def as Record<string, unknown> & { website?: string; enabled?: unknown }
      providers[key] = { ...rest }
      providerEnabledPatch[key] = false
      configChanged = true
    }
  }

  if (configChanged) {
    config.models = { ...models, mode: 'merge', providers }
    writeOpenclawConfig(config)
    console.log('[Config] 已预置百炼、DeepSeek provider')

    // enabled 状态存 yunyaClaw.json，OpenClaw schema 不识别该字段
    const yc = readYunyaClawConfigRaw()
    const existingEnabled = (yc.providerEnabled as Record<string, boolean>) || {}
    let ycChanged = false
    for (const [k, v] of Object.entries(providerEnabledPatch)) {
      if (existingEnabled[k] === undefined) {
        existingEnabled[k] = v
        ycChanged = true
      }
    }
    if (ycChanged) {
      yc.providerEnabled = existingEnabled
      writeYunyaClawConfigRaw(yc)
    }
  }
}

/** 确保 Gateway 配置完整：mode=local + chatCompletions 开启 + 默认模型使用第一个已配置 provider */
function ensureGatewayConfig(): void {
  const config = readOpenclawConfig()
  const gw = (config.gateway as Record<string, unknown>) || {}
  let changed = false

  if (gw.mode !== 'local') {
    gw.mode = 'local'
    changed = true
    console.log('[Config] 已设置 gateway.mode = local')
  }

  const http = (gw.http as Record<string, unknown>) || {}
  const endpoints = (http.endpoints as Record<string, unknown>) || {}
  const cc = (endpoints.chatCompletions as Record<string, unknown>) || {}

  if (cc.enabled !== true) {
    cc.enabled = true
    endpoints.chatCompletions = cc
    http.endpoints = endpoints
    gw.http = http
    changed = true
    console.log('[Config] 已开启 chatCompletions endpoint')
  }

  // 从 providers 中找第一个有模型的 provider，设置为默认模型
  const agentsSection = (config.agents as Record<string, unknown>) || {}
  const defaults = (agentsSection.defaults as Record<string, unknown>) || {}
  if (!defaults.model) {
    const modelsSection = (config.models as Record<string, unknown>) || {}
    const providers = (modelsSection.providers as Record<string, Record<string, unknown>>) || {}
    for (const [providerKey, pConfig] of Object.entries(providers)) {
      const pModels = pConfig.models as Array<{ id: string }> | undefined
      if (pModels && pModels.length > 0) {
        const defaultModel = `${providerKey}/${pModels[0].id}`
        defaults.model = defaultModel
        agentsSection.defaults = defaults
        config.agents = agentsSection
        changed = true
        console.log(`[Config] 已设置默认模型: ${defaultModel}`)
        break
      }
    }
  }

  if (changed) {
    config.gateway = gw
    writeOpenclawConfig(config)
  }
}

// ---- 对话会话持久化 ----

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

function getSessionsDir(): string {
  return path.join(getOpenclawConfigDir(), 'yunya-sessions')
}

function ensureSessionsDir(): string {
  const dir = getSessionsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getSessionFilePath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`)
}

function loadSessionIndex(): Array<{ id: string; title: string; model: string; createdAt: number; updatedAt: number }> {
  const dir = getSessionsDir()
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  const sessions: Array<{ id: string; title: string; model: string; createdAt: number; updatedAt: number }> = []
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as ChatSession
      sessions.push({ id: data.id, title: data.title, model: data.model, createdAt: data.createdAt, updatedAt: data.updatedAt })
    } catch { /* 忽略损坏文件 */ }
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

ipcMain.handle('chat:listSessions', () => {
  try {
    return { success: true, sessions: loadSessionIndex() }
  } catch (err) {
    return { success: false, sessions: [], error: String(err) }
  }
})

ipcMain.handle('chat:loadSession', (_event, sessionId: string) => {
  try {
    const p = getSessionFilePath(sessionId)
    if (!fs.existsSync(p)) return { success: false, error: '会话不存在' }
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as ChatSession
    return { success: true, session: data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('chat:saveSession', (_event, session: ChatSession) => {
  try {
    ensureSessionsDir()
    fs.writeFileSync(getSessionFilePath(session.id), JSON.stringify(session, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('chat:deleteSession', (_event, sessionId: string) => {
  try {
    const p = getSessionFilePath(sessionId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 从 sessionKey (agent:X:y) 解析 agentId */
function parseAgentIdFromSessionKey(sessionKey: string): string | null {
  const m = /^agent:([^:]+):/i.exec(sessionKey.trim())
  return m ? m[1] : null
}

/** 解析 OpenClaw session JSONL 路径。sessionKey 格式 agent:agentId:main 或 agent:agentId:xxx */
function resolveOpenClawSessionFilePathByKey(sessionKey: string): string | null {
  const agentId = parseAgentIdFromSessionKey(sessionKey)
  if (!agentId) return null
  const configDir = getOpenclawConfigDir()
  const sessionsDir = path.join(configDir, 'agents', normalizeAgentIdForDir(agentId), 'sessions')
  const storePath = path.join(sessionsDir, 'sessions.json')
  if (fs.existsSync(storePath)) {
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Record<string, { sessionFile?: string; sessionId?: string }>
      const key = sessionKey.trim().toLowerCase()
      const entry = store[key] ?? Object.entries(store).find(([k]) => k.toLowerCase() === key)?.[1]
      const sf = entry?.sessionFile?.trim()
      if (sf) {
        const resolved = path.isAbsolute(sf) ? sf : path.join(sessionsDir, sf)
        if (fs.existsSync(resolved)) return resolved
      }
      // cron 等会话可能未设置 sessionFile，fallback 到 sessionId 推导路径（与 OpenClaw resolveSessionTranscriptPath 一致）
      const sid = entry?.sessionId?.trim()
      if (sid) {
        const fallbackPath = path.join(sessionsDir, `${sid}.jsonl`)
        if (fs.existsSync(fallbackPath)) return fallbackPath
      }
    } catch { /* 忽略 */ }
  }
  const defaultPath = path.join(sessionsDir, 'main.jsonl')
  if (fs.existsSync(defaultPath) && sessionKey.toLowerCase().endsWith(':main')) return defaultPath
  return null
}

/** @deprecated 使用 resolveOpenClawSessionFilePathByKey(sessionKey)。兼容旧调用：agentId 视为 agent:agentId:main */
function resolveOpenClawSessionFilePath(agentId: string): string | null {
  return resolveOpenClawSessionFilePathByKey(`agent:${normalizeAgentIdForDir(agentId)}:main`)
}

function parseOpenClawTranscriptToMessages(filePath: string): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = []
  let assistantBuffer: string | null = null
  let lastTimestamp = Date.now()

  const flushAssistant = (content: string, ts: number) => {
    if (content.trim()) {
      result.push({ role: 'assistant', content: content.trim(), timestamp: ts })
    }
    assistantBuffer = null
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as { message?: Record<string, unknown>; timestamp?: string }
      const msg = parsed?.message as Record<string, unknown> | undefined
      if (!msg) continue
      const role = (msg.role as string)?.toLowerCase()
      const ts = parsed.timestamp ? new Date(parsed.timestamp).getTime() : (msg.timestamp as number) ?? lastTimestamp
      lastTimestamp = ts

      const extractText = (c: unknown): string => {
        if (typeof c === 'string') return c.trim()
        if (Array.isArray(c)) {
          return (c as unknown[])
            .map((b: unknown) => {
              const block = b as Record<string, unknown>
              if (block?.type === 'text' && typeof block.text === 'string') return block.text.trim()
              return ''
            })
            .filter(Boolean)
            .join('\n')
        }
        return ''
      }

      /** 提取 assistant 的 text + thinking，用于展示（thinking 用 <thinking> 包裹） */
      const extractAssistantDisplay = (c: unknown): string => {
        if (typeof c === 'string') return c.trim()
        if (Array.isArray(c)) {
          const parts: string[] = []
          for (const b of c as unknown[]) {
            const block = b as Record<string, unknown>
            const t = (block?.type as string)?.toLowerCase()
            if (t === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
              const safe = String(block.thinking).replace(/<\/thinking>/gi, '\u200b')
              parts.push(`<thinking>${safe}</thinking>`)
            } else if (t === 'text' && typeof block.text === 'string' && block.text.trim()) {
              parts.push(block.text.trim())
            }
          }
          return parts.join('\n')
        }
        return ''
      }

      const extractToolUse = (c: unknown): Array<{ name: string; input: Record<string, unknown> }> => {
        const out: Array<{ name: string; input: Record<string, unknown> }> = []
        if (Array.isArray(c)) {
          for (const b of c as unknown[]) {
            const block = b as Record<string, unknown>
            const t = (block?.type as string)?.toLowerCase()
            if (t === 'tool_use' || t === 'toolcall' || t === 'tool_call') {
              const name = typeof block.name === 'string' ? block.name : 'unknown'
              const input = (block.input ?? block.arguments ?? block.args) as Record<string, unknown> ?? {}
              out.push({ name, input })
            }
          }
        }
        if (out.length === 0) {
          const rawCalls = msg.tool_calls ?? msg.toolCalls ?? msg.function_call ?? msg.functionCall
          if (Array.isArray(rawCalls)) {
            for (const call of rawCalls) {
              const cc = call as Record<string, unknown>
              const fn = cc.function as Record<string, unknown> | undefined
              const name = (typeof cc.name === 'string' ? cc.name : fn?.name) ?? 'unknown'
              let input = cc.input ?? fn?.arguments
              if (typeof input === 'string') {
                try {
                  input = JSON.parse(input) as Record<string, unknown>
                } catch {
                  input = {}
                }
              }
              out.push({ name: String(name), input: (typeof input === 'object' && input ? input : {}) as Record<string, unknown> })
            }
          }
        }
        return out
      }

      const extractToolResult = (c: unknown): string[] => {
        if (typeof c === 'string') return [c.trim()].filter(Boolean)
        if (Array.isArray(c)) {
          const out: string[] = []
          for (const b of c as unknown[]) {
            const block = b as Record<string, unknown>
            const t = (block?.type as string)?.toLowerCase()
            if (t === 'tool_result' || t === 'tool_result_error') {
              const content = block.content ?? block.result ?? block.text
              out.push(typeof content === 'string' ? content : JSON.stringify(content ?? ''))
            } else if (t === 'text' || t === 'output_text' || t === 'input_text') {
              const text = block.text
              if (typeof text === 'string' && text.trim()) out.push(text.trim())
            }
          }
          return out
        }
        return []
      }

      const toToolResultTag = (tr: string, toolName?: string): string => {
        const safe = tr.replace(/<\/tool_result>/gi, '\u200b') // 避免内容中的闭合标签破坏解析
        if (toolName && toolName !== 'tool') {
          return `<tool_result>${JSON.stringify({ title: toolName, content: safe })}</tool_result>`
        }
        return `<tool_result>${safe}</tool_result>`
      }

      if (role === 'user') {
        const text = extractText(msg.content)
        const toolResults = extractToolResult(msg.content)
        if (toolResults.length > 0 && assistantBuffer !== null) {
          for (const tr of toolResults) {
            assistantBuffer += '\n' + toToolResultTag(tr)
          }
        }
        if (text) {
          if (assistantBuffer !== null) {
            flushAssistant(assistantBuffer, ts)
          }
          const userContent = stripUserMessageForDisplay(text)
          if (userContent) {
            result.push({ role: 'user', content: userContent, timestamp: ts })
          }
        }
      } else if (role === 'assistant') {
        const displayContent = extractAssistantDisplay(msg.content)
        const toolUses = extractToolUse(msg.content)
        const parts: string[] = []
        if (assistantBuffer !== null) {
          flushAssistant(assistantBuffer, ts)
        }
        if (displayContent) parts.push(displayContent)
        for (const tu of toolUses) {
          parts.push(`<tool_call>${JSON.stringify({ name: tu.name, arguments: tu.input })}</tool_call>`)
        }
        if (toolUses.length > 0) {
          assistantBuffer = parts.join('\n')
        } else {
          const joined = parts.join('\n')
          if (joined) result.push({ role: 'assistant', content: joined, timestamp: ts })
        }
      } else if (role === 'tool' || role === 'toolresult') {
        const toolResults = extractToolResult(msg.content)
        const toolName = String(msg.toolName ?? msg.tool_name ?? msg.name ?? 'tool')
        if (assistantBuffer !== null && toolResults.length > 0) {
          for (const tr of toolResults) {
            assistantBuffer += '\n' + toToolResultTag(tr, toolName)
          }
        }
      }
    } catch { /* 跳过损坏行 */ }
  }
  if (assistantBuffer !== null) {
    flushAssistant(assistantBuffer, lastTimestamp)
  }
  return result
}

/** sessionKeyOrAgentId: OpenClaw sessionKey (agent:X:y) 或旧格式 agentId（视为 main） */
ipcMain.handle('chat:loadOpenClawTranscript', (_event, sessionKeyOrAgentId: string) => {
  try {
    const filePath = sessionKeyOrAgentId.includes(':')
      ? resolveOpenClawSessionFilePathByKey(sessionKeyOrAgentId)
      : resolveOpenClawSessionFilePath(sessionKeyOrAgentId)
    if (!filePath) return { success: true, messages: [] }
    const messages = parseOpenClawTranscriptToMessages(filePath)
    return { success: true, messages }
  } catch (err) {
    return { success: false, error: String(err), messages: [] }
  }
})

ipcMain.handle('chat:resetSession', async (_event, agentId: string, reason: 'new' | 'reset' = 'new') => {
  try {
    const sessionKey = `agent:${normalizeAgentIdForDir(agentId)}:main`
    await gatewayRpc('sessions.reset', { key: sessionKey, reason })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 向 Gateway 发送 chat.abort，中止当前会话的回复 */
ipcMain.handle('chat:abort', async (_event, sessionKey: string, runId?: string) => {
  try {
    const params: Record<string, unknown> = { sessionKey }
    if (runId) params.runId = runId
    await gatewayRpc('chat.abort', params)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 通过 Gateway 获取会话列表（OpenClaw 多会话） */
ipcMain.handle('chat:listGatewaySessions', async (_event, agentId: string) => {
  try {
    const data = await gatewayRpc('sessions.list', {
      agentId: normalizeAgentIdForDir(agentId),
      limit: 50,
      includeDerivedTitles: true,
      includeLastMessage: true,
      includeGlobal: false,
      includeUnknown: false,
    })
    const raw = data as { sessions?: Array<{ key: string; label?: string; derivedTitle?: string; lastMessagePreview?: string; updatedAt?: number }> }
    return { success: true, sessions: raw.sessions ?? [] }
  } catch (err) {
    return { success: false, sessions: [], error: String(err) }
  }
})

/** 通过 Gateway 修改会话名称（sessions.patch label） */
ipcMain.handle('chat:patchGatewaySession', async (_event, sessionKey: string, label: string) => {
  try {
    await gatewayRpc('sessions.patch', { key: sessionKey, label: label.trim() })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 通过 Gateway 重置指定 sessionKey 的会话 */
ipcMain.handle('chat:resetGatewaySession', async (_event, sessionKey: string, reason?: 'new' | 'reset') => {
  try {
    await gatewayRpc('sessions.reset', { key: sessionKey, ...(reason ? { reason } : {}) })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- Agent 管理（通过 Gateway WebSocket RPC） ----

ipcMain.handle('agents:list', async () => {
  try {
    const data = await gatewayRpc('agents.list', {})
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 与 OpenClaw normalizeAgentId 一致：用于从 name 推导目录名 */
function normalizeAgentIdForDir(value: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return 'main'
  const validRe = /^[a-z0-9][a-z0-9_-]{0,63}$/i
  if (validRe.test(trimmed)) return trimmed.toLowerCase()
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 64) || 'main'
}

ipcMain.handle('agents:create', async (_event, params: { name: string; code?: string; emoji?: string }) => {
  try {
    const code = params.code?.trim()
    // 若用户填了 code 则用 code 推导 agentId，否则用时间戳生成唯一英文 id（避免中文名推导出 main）
    const agentId = code
      ? normalizeAgentIdForDir(code)
      : `agent-${Date.now().toString(36)}`
    const workspace = path.join(getOpenclawConfigDir(), 'workspaces', agentId)
    // agents.create 的 name 决定内部 agentId，必须是能推导出合法 id 的英文字符串
    const createName = agentId
    const data = await gatewayRpc('agents.create', {
      name: createName,
      workspace,
      ...(params.emoji ? { emoji: params.emoji } : {}),
    })
    // 创建完成后，将显示名称写入 IDENTITY.md（替换所有 Name: 行，避免末尾追加的覆盖前面的）
    if (params.name !== createName) {
      const identityPath = path.join(workspace, 'IDENTITY.md')
      if (fs.existsSync(identityPath)) {
        let content = fs.readFileSync(identityPath, 'utf-8')
        if (/^\s*-\s*Name:\s*/m.test(content)) {
          // 替换全部 Name: 行为用户填写的显示名称
          content = content.replace(/^(\s*-\s*Name:\s*).*$/gm, `$1${params.name}`)
        } else {
          content = `- Name: ${params.name}\n${content}`
        }
        fs.writeFileSync(identityPath, content, 'utf-8')
      }
    }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('agents:delete', async (_event, agentId: string) => {
  try {
    const data = await gatewayRpc('agents.delete', { agentId, deleteFiles: true })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 保存数字人头像到 agent workspace/avatar.png（OpenClaw 要求 workspace 相对路径），返回 workspace 相对路径如 avatar.png */
ipcMain.handle('agents:saveAvatar', async (_event, agentId: string, base64DataUrl: string) => {
  try {
    const configDir = getOpenclawConfigDir()
    const workspaceDir = agentId === 'main'
      ? path.join(configDir, 'workspace')
      : path.join(configDir, 'workspaces', agentId)
    if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true })
    const m = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!m) return { success: false, error: '无效的图片格式' }
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
    const buffer = Buffer.from(m[2], 'base64')
    const avatarPath = path.join(workspaceDir, `avatar.${ext}`)
    fs.writeFileSync(avatarPath, buffer)
    const workspaceRel = `avatar.${ext}`
    return { success: true, avatarUrl: workspaceRel }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** workspace:agentId:path 格式，用于解析 agent workspace 内的头像 */
function resolveWorkspaceMediaUrl(url: string): string | null {
  if (!url.startsWith('workspace:')) return null
  const rest = url.slice('workspace:'.length)
  const colon = rest.indexOf(':')
  if (colon < 0) return null
  const agentId = rest.slice(0, colon)
  const relPath = rest.slice(colon + 1).trim()
  if (!agentId || !relPath) return null
  const configDir = getOpenclawConfigDir()
  const workspaceDir = agentId === 'main'
    ? path.join(configDir, 'workspace')
    : path.join(configDir, 'workspaces', agentId)
  return path.join(workspaceDir, relPath.replace(/\//g, path.sep))
}

ipcMain.handle('media:readFile', async (_event, mediaUrl: string) => {
  try {
    const configDir = getOpenclawConfigDir()
    let filePath: string

    const workspacePath = resolveWorkspaceMediaUrl(mediaUrl)
    if (workspacePath) {
      filePath = workspacePath
    } else if (mediaUrl.startsWith('screenshot://')) {
      const rest = mediaUrl.slice('screenshot://'.length)
      filePath = path.join(configDir, 'media', rest)
    } else if (mediaUrl.startsWith('media://')) {
      const rest = mediaUrl.slice('media://'.length)
      filePath = path.join(configDir, 'media', rest)
    } else if (mediaUrl.startsWith('file://')) {
      let p = mediaUrl.slice(7).replace(/%20/g, ' ')
      if (process.platform === 'win32' && p.startsWith('/') && /^\/[A-Za-z]:/.test(p)) {
        p = p.slice(1)
      }
      filePath = p.replace(/\//g, path.sep)
    } else {
      filePath = mediaUrl.trim().replace(/\//g, path.sep)
    }

    if (!fs.existsSync(filePath)) {
      const mediaBrowserMatch = filePath.match(/[/\\]media[/\\]browser[/\\]([^/\\]+\.(?:png|jpe?g|gif|webp|bmp))$/i)
      if (mediaBrowserMatch) {
        const fallbackPath = path.join(configDir, 'media', 'browser', mediaBrowserMatch[1])
        if (fs.existsSync(fallbackPath)) {
          filePath = fallbackPath
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      console.warn('[media:readFile] 文件不存在:', { mediaUrl, resolvedPath: filePath })
      return { success: false, error: `文件不存在: ${path.basename(filePath)}` }
    }
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : ext === '.png' ? 'image/png'
               : ext === '.webp' ? 'image/webp'
               : ext === '.gif' ? 'image/gif'
               : 'image/png'
    const base64 = buffer.toString('base64')
    return { success: true, dataUrl: `data:${mime};base64,${base64}` }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('util:openExternal', async (_event, url: string) => {
  try {
    if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return { success: false, error: '仅支持 http/https URL' }
    }
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('util:saveImage', async (_event, imageUrl: string, suggestedName?: string) => {
  try {
    const configDir = getOpenclawConfigDir()
    let buffer: Buffer
    let ext = '.png'

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const res = await new Promise<Buffer>((resolve, reject) => {
        const url = new URL(imageUrl)
        const mod = url.protocol === 'https:' ? https : http
        mod.get(imageUrl, (r) => {
          const chunks: Buffer[] = []
          r.on('data', (c: Buffer) => chunks.push(c))
          r.on('end', () => resolve(Buffer.concat(chunks)))
          r.on('error', reject)
        }).on('error', reject)
      })
      buffer = res
      const m = imageUrl.match(/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i)
      if (m) ext = m[1].toLowerCase().replace('jpeg', 'jpg')
    } else {
      let filePath: string
      if (imageUrl.startsWith('screenshot://')) {
        filePath = path.join(configDir, 'media', imageUrl.slice('screenshot://'.length))
      } else if (imageUrl.startsWith('media://')) {
        filePath = path.join(configDir, 'media', imageUrl.slice('media://'.length))
      } else if (imageUrl.startsWith('file://')) {
        let p = imageUrl.slice(7).replace(/%20/g, ' ')
        if (process.platform === 'win32' && p.startsWith('/') && /^\/[A-Za-z]:/.test(p)) p = p.slice(1)
        filePath = p.replace(/\//g, path.sep)
      } else {
        filePath = imageUrl.trim().replace(/\//g, path.sep)
      }
      if (!fs.existsSync(filePath)) {
        const m = filePath.match(/[/\\]media[/\\]browser[/\\]([^/\\]+\.(?:png|jpe?g|gif|webp|bmp))$/i)
        if (m) {
          const fallback = path.join(configDir, 'media', 'browser', m[1])
          if (fs.existsSync(fallback)) filePath = fallback
        }
      }
      if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' }
      buffer = fs.readFileSync(filePath)
      ext = path.extname(filePath).toLowerCase() || '.png'
    }

    const name = suggestedName || `image-${Date.now()}${ext}`
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const opts = {
      defaultPath: name,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    }
    const { canceled, filePath: savePath } = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    if (canceled || !savePath) return { success: true, canceled: true }
    fs.writeFileSync(savePath, buffer)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('agents:rename', async (_event, params: { agentId: string; newName: string }) => {
  try {
    const { agentId, newName } = params
    const name = newName.trim()
    if (!name) return { success: false, error: '名称不能为空' }

    // 1. 通过 RPC 更新 openclaw 内部名称
    await gatewayRpc('agents.update', { agentId, name })

    // 2. 更新对应 workspace 的 IDENTITY.md
    const configDir = getOpenclawConfigDir()
    // main agent 的 workspace 在 ~/.openclaw/workspace，其他在 ~/.openclaw/workspaces/<id>
    const workspaceDir = agentId === 'main'
      ? path.join(configDir, 'workspace')
      : path.join(configDir, 'workspaces', agentId)

    const identityPath = path.join(workspaceDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      // 替换 Name 行，若有则更新，若没有则在文件头追加
      if (/^\s*-\s*\*\*Name:\*\*/m.test(content)) {
        content = content.replace(
          /^(\s*-\s*\*\*Name:\*\*\s*).*$/m,
          `$1${name}`
        )
      } else {
        content = `- **Name:** ${name}\n\n${content}`
      }
      fs.writeFileSync(identityPath, content, 'utf-8')
    } else if (fs.existsSync(workspaceDir)) {
      // workspace 存在但没有 IDENTITY.md，创建一个
      const content = `# IDENTITY.md - Who Am I?\n\n- **Name:** ${name}\n- **Creature:** AI\n- **Vibe:**\n- **Emoji:**\n- **Avatar:**\n`
      fs.writeFileSync(identityPath, content, 'utf-8')
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('agents:update', async (_event, params: { agentId: string; name?: string; model?: string }) => {
  try {
    const data = await gatewayRpc('agents.update', params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- Cron 定时任务 ----
ipcMain.handle('cron:list', async (_event, params?: { includeDisabled?: boolean; limit?: number; offset?: number; query?: string; enabled?: string; sortBy?: string; sortDir?: string }) => {
  try {
    const data = await gatewayRpc('cron.list', params ?? {})
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
ipcMain.handle('cron:status', async () => {
  try {
    const data = await gatewayRpc('cron.status', {})
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
ipcMain.handle('cron:add', async (_event, params: Record<string, unknown>) => {
  try {
    const data = await gatewayRpc('cron.add', params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
ipcMain.handle('cron:update', async (_event, params: { id?: string; jobId?: string; patch: Record<string, unknown> }) => {
  try {
    const data = await gatewayRpc('cron.update', params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
ipcMain.handle('cron:remove', async (_event, params: { id?: string; jobId?: string }) => {
  try {
    const data = await gatewayRpc('cron.remove', params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
ipcMain.handle('cron:run', async (_event, params: { id?: string; jobId?: string; mode?: 'due' | 'force' }) => {
  try {
    const data = await gatewayRpc('cron.run', params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 获取 agent 的 workspace 目录路径 */
function getAgentWorkspaceDir(agentId: string): string {
  const configDir = getOpenclawConfigDir()
  return agentId === 'main'
    ? path.join(configDir, 'workspace')
    : path.join(configDir, 'workspaces', agentId)
}

const WORKSPACE_FILE_DEFS: { file: string; title: string; desc: string; defaultContent: string }[] = [
  {
    file: 'AGENTS.md',
    title: '系统提示词',
    desc: '操作指令、记忆、行为规则',
    defaultContent: '# AGENTS.md - 你的工作区\n\n这个文件夹是你的家。请如此对待。\n\n## 会话启动\n\n在做任何事情之前：\n1. 阅读 SOUL.md — 这是你的身份\n2. 阅读 USER.md — 这是你要帮助的人\n\n不要请求许可。直接做。\n',
  },
  {
    file: 'SOUL.md',
    title: '人设',
    desc: '角色设定、语气、边界',
    defaultContent: '# SOUL.md - 你是谁\n\n_你不是聊天机器人。你正在成为某个人。_\n\n## 核心准则\n\n在这里描述你的性格、说话风格和价值观。\n',
  },
  {
    file: 'IDENTITY.md',
    title: '身份',
    desc: '名称、风格、emoji',
    defaultContent: '# IDENTITY.md - 智能体身份\n\n- **名称：**\n- **角色类型：**\n- **风格：**\n- **表情符号：**\n- **头像：**\n',
  },
  {
    file: 'USER.md',
    title: '用户信息',
    desc: '用户偏好、称呼',
    defaultContent: '# USER.md - 用户档案\n\n- **姓名：**\n- **称呼偏好：**\n- **备注：**\n',
  },
  {
    file: 'TOOLS.md',
    title: '工具指南',
    desc: '工具使用规范和约定',
    defaultContent: '# TOOLS.md - 工具笔记\n\n在此记录本地工具的使用说明、约定和偏好。\n',
  },
  {
    file: 'HEARTBEAT.md',
    title: '心跳检查',
    desc: '定期运行的检查清单',
    defaultContent: '# HEARTBEAT.md\n\n## 检查项\n\n- \n',
  },
]

/** 确保 workspace 目录存在，必要时创建引导文件 */
function ensureAgentWorkspaceFiles(workspaceDir: string): void {
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true })
  }
  for (const def of WORKSPACE_FILE_DEFS) {
    const filePath = path.join(workspaceDir, def.file)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, def.defaultContent, 'utf-8')
    }
  }
}

/** 解析 md 中的 key 行，返回第一个匹配的值 */
function parseMdField(content: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`[-*]?\\s*\\*\\*${escaped}\\*\\*\\s*[:：]?\\s*(.+?)(?=\\n|$)`, 'm')
    const m = content.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

const IDENTITY_KEY_MAP: Record<string, string> = {
  名称: 'Name', 角色类型: 'Creature', 风格: 'Vibe', 表情符号: 'Emoji', 头像: 'Avatar',
}

/** 原地替换 md 中的 key 行：contains 匹配 - **Name:**，key 一行、value 下一行缩进；下一行若无 **XXX** 则跳过（原值行） */
function setMdField(content: string, cnKey: string, value: string): string {
  const enKey = IDENTITY_KEY_MAP[cnKey] || cnKey
  const needle1 = `**${enKey}:**`
  const needle2 = `**${cnKey}:**`
  const needle3 = `**${cnKey}：**`
  const keyLine = `- **${enKey}:**`
  const valueLine = `  ${value}`
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const hasKey = line.includes(needle1) || line.includes(needle2) || line.includes(needle3)
    if (hasKey) {
      out.push(keyLine)
      out.push(valueLine)
      const next = lines[i + 1]
      if (next != null && !next.includes('**')) {
        i += 2
        continue
      }
    } else {
      out.push(line)
    }
    i += 1
  }
  return out.join('\n')
}

ipcMain.handle('persona:getFiles', async (_event, agentId: string) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const identity = fs.readFileSync(path.join(workspaceDir, 'IDENTITY.md'), 'utf-8')
    const soul = fs.readFileSync(path.join(workspaceDir, 'SOUL.md'), 'utf-8')
    const user = fs.readFileSync(path.join(workspaceDir, 'USER.md'), 'utf-8')
    const simple = {
      identity: {
        name: parseMdField(identity, ['名称', 'Name']),
        creature: parseMdField(identity, ['角色类型', 'Creature']),
        vibe: parseMdField(identity, ['风格', 'Vibe']),
        emoji: parseMdField(identity, ['表情符号', 'Emoji']),
        avatar: parseMdField(identity, ['头像', 'Avatar']),
      },
      soul,
      user: {
        name: parseMdField(user, ['姓名', 'Name']),
        preferredAddress: parseMdField(user, ['称呼偏好', 'Preferred address', 'Preferred Address']),
        notes: parseMdField(user, ['备注', 'Notes']),
      },
    }
    return { success: true, identity, soul, user, simple }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('persona:saveSimple', async (_event, params: {
  agentId: string
  identity?: { name?: string; creature?: string; vibe?: string; emoji?: string; avatar?: string }
  soul?: string
  user?: { name?: string; preferredAddress?: string; notes?: string }
}) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(params.agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const identityPath = path.join(workspaceDir, 'IDENTITY.md')
    const soulPath = path.join(workspaceDir, 'SOUL.md')
    const userPath = path.join(workspaceDir, 'USER.md')

    if (params.identity) {
      let identity = fs.readFileSync(identityPath, 'utf-8')
      const fields: [string, string | undefined][] = [
        ['名称', params.identity.name],
        ['角色类型', params.identity.creature],
        ['风格', params.identity.vibe],
        ['表情符号', params.identity.emoji],
        ['头像', params.identity.avatar],
      ]
      for (const [cnKey, val] of fields) {
        if (val !== undefined && val !== '') {
          identity = setMdField(identity, cnKey, val)
        }
      }
      fs.writeFileSync(identityPath, identity, 'utf-8')
    }
    if (params.soul !== undefined && params.soul !== '') {
      fs.writeFileSync(soulPath, params.soul, 'utf-8')
    }
    if (params.user) {
      let user = fs.readFileSync(userPath, 'utf-8')
      const mapping = [
        ['姓名', params.user.name],
        ['称呼偏好', params.user.preferredAddress],
        ['备注', params.user.notes],
      ] as const
      for (const [key, val] of mapping) {
        if (val !== undefined && val !== '') {
          user = setMdField(user, key, val)
        }
      }
      fs.writeFileSync(userPath, user, 'utf-8')
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

const PERSONA_FILE_MAP: Record<string, string> = {
  identity: 'IDENTITY.md',
  soul: 'SOUL.md',
  user: 'USER.md',
  agents: 'AGENTS.md',
  tools: 'TOOLS.md',
  heartbeat: 'HEARTBEAT.md',
}

ipcMain.handle('persona:saveRaw', async (_event, params: { agentId: string; file: string; content: string }) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(params.agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const fileName = PERSONA_FILE_MAP[params.file] || params.file
    if (!WORKSPACE_FILE_DEFS.some((d) => d.file === fileName)) {
      return { success: false, error: '不支持的文件' }
    }
    const filePath = path.join(workspaceDir, fileName)
    fs.writeFileSync(filePath, params.content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('persona:getWorkspacePath', async (_event, agentId: string) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(agentId)
    return { success: true, path: workspaceDir }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('persona:listFiles', async (_event, agentId: string) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const files: { file: string; title: string; desc: string; size: number; configured: boolean }[] = []
    for (const def of WORKSPACE_FILE_DEFS) {
      const filePath = path.join(workspaceDir, def.file)
      let size = 0
      let configured = false
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        size = stat.size
        configured = size > 80
      }
      files.push({ file: def.file, title: def.title, desc: def.desc, size, configured })
    }
    return { success: true, files }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('persona:getFile', async (_event, params: { agentId: string; file: string }) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(params.agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const fileName = PERSONA_FILE_MAP[params.file] || params.file
    const filePath = path.join(workspaceDir, fileName)
    if (!fs.existsSync(filePath)) {
      const def = WORKSPACE_FILE_DEFS.find((d) => d.file === fileName)
      return { success: true, content: def?.defaultContent ?? '' }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('persona:saveFile', async (_event, params: { agentId: string; file: string; content: string }) => {
  try {
    const workspaceDir = getAgentWorkspaceDir(params.agentId)
    ensureAgentWorkspaceFiles(workspaceDir)
    const fileName = PERSONA_FILE_MAP[params.file] || params.file
    if (!WORKSPACE_FILE_DEFS.some((d) => d.file === fileName)) {
      return { success: false, error: '不支持的文件' }
    }
    const filePath = path.join(workspaceDir, fileName)
    fs.writeFileSync(filePath, params.content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- Skills 扫描 ----

interface SkillMeta {
  name: string
  description: string
  emoji?: string
  source: 'bundled' | 'managed' | 'workspace'
  enabled: boolean
  skillKey?: string
  requires?: Record<string, unknown>
}

function parseSkillFrontmatter(content: string): { name?: string; description?: string; metadata?: Record<string, unknown> } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    // 没有 frontmatter，尝试从 # 标题提取名称
    const titleMatch = content.match(/^#\s+(.+)/m)
    return { name: titleMatch?.[1]?.trim(), description: '' }
  }

  const raw = match[1]
  const result: Record<string, unknown> = {}

  // 简易 YAML 解析：提取 name, description, metadata
  const nameMatch = raw.match(/^name:\s*(.+)$/m)
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '')

  const descMatch = raw.match(/^description:\s*(.+)$/m)
  if (descMatch) result.description = descMatch[1].trim().replace(/^["']|["']$/g, '')

  // 解析 metadata JSON 块
  const metaIdx = raw.indexOf('metadata:')
  if (metaIdx >= 0) {
    const afterMeta = raw.slice(metaIdx + 'metadata:'.length)
    // 找到 JSON 对象
    const jsonStart = afterMeta.indexOf('{')
    if (jsonStart >= 0) {
      let depth = 0
      let jsonEnd = -1
      for (let i = jsonStart; i < afterMeta.length; i++) {
        if (afterMeta[i] === '{') depth++
        else if (afterMeta[i] === '}') {
          depth--
          if (depth === 0) { jsonEnd = i; break }
        }
      }
      if (jsonEnd >= 0) {
        try {
          // JSON5-like: 允许尾逗号、单引号键
          let jsonStr = afterMeta.slice(jsonStart, jsonEnd + 1)
          jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1') // 去尾逗号
          result.metadata = JSON.parse(jsonStr)
        } catch {
          // 忽略解析失败
        }
      }
    }
  }

  return result as { name?: string; description?: string; metadata?: Record<string, unknown> }
}

function scanSkillsDir(dir: string, source: SkillMeta['source']): SkillMeta[] {
  const skills: SkillMeta[] = []
  if (!fs.existsSync(dir)) return skills

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillMdPath = path.join(dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) continue

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8')
        const parsed = parseSkillFrontmatter(content)
        const openclawMeta = (parsed.metadata as Record<string, Record<string, unknown>>)?.openclaw

        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description || '',
          emoji: (openclawMeta?.emoji as string) || undefined,
          source,
          enabled: true,
          skillKey: (openclawMeta?.skillKey as string) || entry.name,
          requires: openclawMeta?.requires as Record<string, unknown> | undefined,
        })
      } catch {
        skills.push({
          name: entry.name,
          description: '',
          source,
          enabled: true,
        })
      }
    }
  } catch (err) {
    console.error(`[Skills] 扫描 ${dir} 失败:`, err)
  }

  return skills
}

function loadAllSkills(): SkillMeta[] {
  const projectRoot = getOpenclawProjectRoot()
  const stateDir = getOpenclawConfigDir()

  const bundled = scanSkillsDir(path.join(projectRoot, 'skills'), 'bundled')
  const managed = scanSkillsDir(path.join(stateDir, 'skills'), 'managed')

  // 读取 skills.entries 配置来获取 enabled 状态
  const config = readOpenclawConfig()
  const skillsConfig = (config.skills as Record<string, unknown>) || {}
  const entries = (skillsConfig.entries as Record<string, Record<string, unknown>>) || {}

  const allSkills = [...bundled, ...managed]
  for (const skill of allSkills) {
    const key = skill.skillKey || skill.name
    if (entries[key] && entries[key].enabled === false) {
      skill.enabled = false
    }
  }

  return allSkills
}

// ---- Window ----

/** 将原始图片创建为包含多尺寸的 NativeImage（Windows 任务栏需要） */
function createMultiSizeIcon(imagePath: string): Electron.NativeImage | undefined {
  const original = nativeImage.createFromPath(imagePath)
  if (original.isEmpty()) return undefined
  if (process.platform !== 'win32') return original
  // Windows 任务栏需要多尺寸图标：16(小图标)、32(标准)、48(任务栏)、256(大图标视图)
  const sizes = [16, 32, 48, 256]
  const resized = sizes.map(s => original.resize({ width: s, height: s }))
  // 用最大尺寸作为基础，再逐个添加不同分辨率的表示
  const multi = nativeImage.createEmpty()
  for (const img of resized) {
    const size = img.getSize()
    multi.addRepresentation({ width: size.width, height: size.height, buffer: img.toPNG(), scaleFactor: 1.0 })
  }
  return multi.isEmpty() ? original : multi
}

/** 获取应用外观：标题与图标（用于 createWindow 及动态更新） */
function getAppearance(): { title: string; icon: Electron.NativeImage | undefined } {
  const cfg = YunyaClawConfigService.read()
  const appName = typeof cfg.appName === 'string' && cfg.appName.trim() ? cfg.appName.trim() : 'Yunya Claw'
  const customIconPath = getAppearanceIconPath()
  let icon: Electron.NativeImage | undefined
  if (fs.existsSync(customIconPath)) {
    icon = createMultiSizeIcon(customIconPath)
  }
  if (!icon) {
    const defaultPath = path.join(app.getAppPath(), 'public', 'icon.png')
    icon = fs.existsSync(defaultPath) ? createMultiSizeIcon(defaultPath) : undefined
  }
  return { title: appName, icon }
}

/** 将当前外观应用到主窗口（标题、图标）
 *  @param refreshTaskbar 是否强制刷新 Windows 任务栏（动态修改时需要，启动时不需要）
 */
function applyAppearanceToWindow(refreshTaskbar = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { title, icon } = getAppearance()
  mainWindow.setTitle(title)
  if (icon && !icon.isEmpty()) {
    mainWindow.setIcon(icon)
  }
  // Windows + frame:false: setTitle/setIcon 可能不刷新任务栏，
  // 通过 setSkipTaskbar 切换强制 Windows 重新注册任务栏条目。
  // 需要加延时，否则 Windows 来不及处理注销/重注册。
  if (refreshTaskbar && process.platform === 'win32') {
    mainWindow.setSkipTaskbar(true)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(false)
      }
    }, 150)
  }
}

function createWindow() {
  Menu.setApplicationMenu(null)

  const { title, icon } = getAppearance()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title,
    icon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    frame: false,
    backgroundColor: '#0a0a0a',
  })

  // 开发模式用 Vite 开发服务器；打包后加载本地 dist 构建文件
  const loadUrl = VITE_DEV_SERVER_URL
  const distIndex = path.join(process.env.DIST!, 'index.html')
  if (loadUrl) {
    console.log('[Window] 加载 URL:', loadUrl)
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[Window] did-fail-load:', code, desc, url)
    })
    mainWindow.loadURL(loadUrl)
  } else {
    console.log('[Window] 加载文件:', distIndex)
    mainWindow.loadFile(distIndex)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const showWindow = () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }
  mainWindow.once('ready-to-show', showWindow)
  mainWindow.webContents.once('did-finish-load', () => {
    showWindow()
    if (DEBUG_MODE) mainWindow?.webContents.openDevTools()
    // 页面加载后重新应用自定义标题和图标，覆盖 document.title 的默认值
    applyAppearanceToWindow()
    if (gatewayStarting && !gatewayProcess) {
      mainWindow?.webContents.send('gateway:status', { running: false, starting: true, initializing: false })
    }
  })
  setTimeout(showWindow, 3000)
}

// ---- Gateway ----

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      const port = addr.port
      server.close(() => resolve(port))
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(server as any).on('error', reject)
  })
}

/** 加载 ~/.openclaw/.env 并合并到 env，供 Gateway 子进程使用 */
function loadEnvForGateway(): Record<string, string> {
  const envPath = path.join(getOpenclawConfigDir(), '.env')
  try {
    if (!fs.existsSync(envPath)) return {}
    const entries = parseEnvFile(fs.readFileSync(envPath, 'utf-8'))
    return Object.fromEntries(entries.map(e => [e.key, e.value]))
  } catch {
    return {}
  }
}

function startGateway(): Promise<void> {
  return new Promise(async (resolve) => {
    const openclawDir = getOpenclawProjectRoot()

    try {
      gatewayStarting = true
      mainWindow?.webContents.send('gateway:status', { running: false, starting: true, initializing: false })
      gatewayPort = await findAvailablePort()
      console.log(`[Gateway] 使用端口: ${gatewayPort}`)

      const { nodePath, nodeDir } = getNodeExecutablePath()
      const dotenv = loadEnvForGateway()
      const configPath = getOpenclawConfigPath()
      const stateDir = getOpenclawConfigDir()
      const baseEnv: Record<string, string> = {
        ...process.env,
        ...dotenv,
        PYTHONIOENCODING: 'utf-8',
        FORCE_COLOR: '0',
        OPENCLAW_NO_RESPAWN: '1', // 禁止 detached 重启，否则关闭应用时无法追踪并终止新进程
        OPENCLAW_CONFIG_PATH: configPath,
        OPENCLAW_STATE_DIR: stateDir,
      }
      // 打包时把 node.exe 所在目录加入 PATH，便于加载依赖 DLL
      if (nodeDir) {
        baseEnv.PATH = `${nodeDir}${path.delimiter}${baseEnv.PATH || ''}`
      }

      const openclawEntry = path.join(openclawDir, 'openclaw.mjs')
      const openclawDist = path.join(openclawDir, 'dist', 'entry.js')
      if (!fs.existsSync(openclawEntry) || !fs.existsSync(openclawDist)) {
        const errMsg = `Gateway 入口缺失: openclaw.mjs=${fs.existsSync(openclawEntry)}, dist/entry.js=${fs.existsSync(openclawDist)}`
        debugLog('[Gateway]', errMsg)
        mainWindow?.webContents.send('gateway:error', errMsg)
        gatewayStarting = false
        resolve()
        return
      }
      debugLog('[Gateway] spawn:', nodePath, 'cwd:', openclawDir, 'config:', configPath)
      gatewayProcess = spawn(nodePath, ['openclaw.mjs', 'gateway', '--port', String(gatewayPort), '--force'], {
        cwd: openclawDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: baseEnv,
      })

      gatewayProcess.on('error', (err) => {
        debugLog('[Gateway] spawn error:', err.message, err)
        mainWindow?.webContents.send('gateway:error', `Gateway 启动失败: ${err.message}\n\n请设置 OPENCLAW_DEBUG=1 后重启，查看 ~/.openclaw/yunya-claw-debug.log 获取详情。`)
      })

      let portDetected = false
      let resolved = false

      const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      gatewayProcess.stdout?.on('data', (data: Buffer) => {
        const raw = data.toString('utf8')
        const msg = stripAnsi(raw)
        debugLog('[Gateway] stdout:', raw)
        console.log('[Gateway]', raw)
        mainWindow?.webContents.send('gateway:log', msg)

        if (!portDetected) {
          const portMatch = raw.match(/listening on ws:\/\/127\.0\.0\.1:(\d+)/)
          if (portMatch) {
            gatewayPort = parseInt(portMatch[1], 10)
            portDetected = true
            gatewayStarting = false
            console.log(`[Gateway] 检测到实际端口: ${gatewayPort}`)
            mainWindow?.webContents.send('gateway:status', { running: true, port: gatewayPort })
            if (!resolved) { resolved = true; resolve() }
          }
        }
      })

      gatewayProcess.stderr?.on('data', (data: Buffer) => {
        const raw = data.toString('utf8')
        const msg = stripAnsi(raw)
        debugLog('[Gateway] stderr:', raw)
        console.error('[Gateway Error]', raw)
        mainWindow?.webContents.send('gateway:error', msg)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(gatewayProcess as any).on('exit', (code: number | null, signal: string | null) => {
        gatewayStarting = false
        debugLog('[Gateway] exit code:', code, 'signal:', signal)
        console.log(`[Gateway] 进程退出，代码: ${code}`)
        mainWindow?.webContents.send('gateway:status', { running: false, code })
        gatewayProcess = null
        if (!resolved) { resolved = true; resolve() }
      })
    } catch (err) {
      console.error('[Gateway] 启动失败:', err)
      mainWindow?.webContents.send('gateway:error', String(err))
      gatewayStarting = false
      resolve()
    }
  })
}

function stopGateway(): Promise<void> {
  if (!gatewayProcess) return Promise.resolve()
  const proc = gatewayProcess
  gatewayProcess = null

  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32' && proc.pid) {
        const tk = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        tk.on('close', () => resolve())
        tk.on('error', () => resolve())
      } else {
        proc.kill('SIGTERM')
        proc.once('exit', () => resolve())
        setTimeout(resolve, 3000)
      }
    } catch (err) {
      console.error('[Gateway] 停止进程失败:', err)
      resolve()
    }
  })
}

// ---- Gateway WebSocket RPC ----

/** 从 openclaw.json 读取 Gateway auth token */
function getGatewayAuthToken(): string | undefined {
  try {
    const config = readOpenclawConfig()
    const gateway = config.gateway as Record<string, unknown> | undefined
    const auth = gateway?.auth as Record<string, unknown> | undefined
    return auth?.token as string | undefined
  } catch { return undefined }
}

/** 通过 WebSocket 向 Gateway 发送一次性 RPC 请求 */
function gatewayRpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WS = require('ws') as { new(url: string): import('ws').WebSocket }
    const url = `ws://127.0.0.1:${gatewayPort}`
    const ws = new WS(url)
    const reqId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) { settled = true; ws.close(); reject(new Error('RPC 超时 (10s)')) }
    }, 10000)

    ws.on('open', () => {
      const token = getGatewayAuthToken()
      ws.send(JSON.stringify({
        type: 'req',
        id: 'connect',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            displayName: 'yunya-claw',
            version: '1.0.0',
            platform: process.platform,
            mode: 'backend',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write', 'operator.admin'],
          ...(token ? { auth: { token } } : {}),
        },
      }))
    })

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString())
        // connect 响应
        if (msg.id === 'connect' && msg.type === 'res') {
          if (msg.ok) {
            ws.send(JSON.stringify({ type: 'req', id: reqId, method, params }))
          } else {
            settled = true
            clearTimeout(timer)
            ws.close()
            reject(new Error(msg.error?.message || 'Gateway 认证失败'))
          }
          return
        }
        // 实际 RPC 响应
        if (msg.id === reqId && msg.type === 'res') {
          settled = true
          clearTimeout(timer)
          ws.close()
          if (msg.ok) {
            resolve(msg.payload || {})
          } else {
            reject(new Error(msg.error?.message || `RPC ${method} 失败`))
          }
        }
      } catch { /* 忽略非 JSON */ }
    })

    ws.on('error', (err: Error) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err) }
    })
    ws.on('close', () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error('WebSocket 连接关闭')) }
    })
  })
}

// ---- IPC Handlers ----

// Gateway
ipcMain.handle('gateway:start', async () => {
  await startGateway()
  return { success: true, port: gatewayPort }
})

ipcMain.handle('gateway:stop', () => {
  stopGateway()
  return { success: true }
})

ipcMain.handle('gateway:status', () => {
  // gatewayStarting=true 表示进程已 spawn 但端口尚未确认，渲染进程应继续等待 gateway:status 事件
  const running = gatewayProcess !== null && !gatewayStarting
  return { running, starting: gatewayStarting, port: gatewayPort }
})

ipcMain.handle('gateway:token', () => {
  return getGatewayAuthToken() || ''
})

// 窗口控制
ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => { mainWindow?.close() })

// 配置读写
ipcMain.handle('config:read', () => {
  const config = readOpenclawConfig()
  const models = (config.models as Record<string, unknown>) || {}
  const providers = (models.providers as Record<string, Record<string, unknown>>) || {}
  const yc = readYunyaClawConfigRaw()
  const providerWebsites = (yc.providerWebsites as Record<string, string>) || getBuiltinProviderWebsites()
  const providerEnabled = (yc.providerEnabled as Record<string, boolean>) || {}
  let augmented = false
  for (const [key, p] of Object.entries(providers)) {
    if (!p || typeof p !== 'object') continue
    if (providerWebsites[key]) {
      p.website = providerWebsites[key]
      augmented = true
    }
    if (typeof providerEnabled[key] === 'boolean') {
      p.enabled = providerEnabled[key]
      augmented = true
    }
  }
  return augmented ? { ...config, models: { ...models, providers } } : config
})

// yunyaClaw.json 统一通过 YunyaClawConfigService 读写，避免多服务并发冲突
ipcMain.handle('yunyaClaw:read', () => YunyaClawConfigService.read())
ipcMain.handle('yunyaClaw:get', (_event, key: string) => YunyaClawConfigService.get(key))
ipcMain.handle('yunyaClaw:update', async (_event, partial: Record<string, unknown>) => {
  await YunyaClawConfigService.update(partial)
  return { success: true }
})

// 应用外观：appName 存 yunyaClaw.json，图标存 ~/.openclaw/.yunya-claw-icon.png
ipcMain.handle('appearance:get', () => {
  const cfg = YunyaClawConfigService.read()
  const appName = typeof cfg.appName === 'string' && cfg.appName.trim() ? cfg.appName.trim() : 'Yunya Claw'
  const customIconPath = getAppearanceIconPath()
  const hasCustomIcon = fs.existsSync(customIconPath)
  return { appName, hasCustomIcon }
})

ipcMain.handle('appearance:getIconDataUrl', () => {
  const p = getAppearanceIconPath()
  if (!fs.existsSync(p)) return null
  try {
    const buf = fs.readFileSync(p)
    const base64 = buf.toString('base64')
    const ext = path.extname(p).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${base64}`
  } catch {
    return null
  }
})

ipcMain.handle('appearance:setAppName', async (_event, appName: string) => {
  await YunyaClawConfigService.update({ appName: typeof appName === 'string' ? appName.trim() || 'Yunya Claw' : 'Yunya Claw' })
  applyAppearanceToWindow(true)
  return { success: true }
})

ipcMain.handle('appearance:setIcon', async (_event, base64: string) => {
  if (typeof base64 !== 'string' || !base64) return { success: false, error: '无效的图标数据' }
  const p = getAppearanceIconPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  try {
    const data = base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(p, Buffer.from(data, 'base64'))
    await YunyaClawConfigService.update({ customIcon: true })
    applyAppearanceToWindow(true)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('appearance:clearIcon', async () => {
  const p = getAppearanceIconPath()
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p) } catch (err) { console.error('[Appearance] 删除图标失败:', err) }
  }
  await YunyaClawConfigService.update({ customIcon: false })
  applyAppearanceToWindow(true)
  return { success: true }
})

// 兼容旧 API，内部走服务
ipcMain.handle('prefs:getHiddenSessions', () => {
  const v = YunyaClawConfigService.get('hiddenSessions')
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, string[]>
  }
  return {}
})
ipcMain.handle('prefs:setHiddenSessions', async (_event, data: Record<string, string[]>) => {
  try {
    await YunyaClawConfigService.update({ hiddenSessions: data })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('config:write', (_event, config: Record<string, unknown>) => {
  try {
    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 合并 channels 配置到 openclaw.json；钉钉时同时确保 gateway.http.endpoints.chatCompletions */
ipcMain.handle('config:patchChannels', (_event, channelId: string, channelConfig: Record<string, unknown>) => {
  try {
    const config = readOpenclawConfig()
    const channels = (config.channels as Record<string, unknown>) || {}
    const existing = (channels[channelId] as Record<string, unknown>) || {}
    channels[channelId] = { ...existing, ...channelConfig }
    config.channels = channels

    if (channelId === 'dingtalk-connector') {
      const gateway = (config.gateway as Record<string, unknown>) || {}
      const http = (gateway.http as Record<string, unknown>) || {}
      const endpoints = (http.endpoints as Record<string, unknown>) || {}
      endpoints.chatCompletions = { ...((endpoints.chatCompletions as Record<string, unknown>) || {}), enabled: true }
      http.endpoints = endpoints
      gateway.http = http
      config.gateway = gateway
    }

    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 按需确保单个插件已安装（接入页保存时调用，从内置包复制，不依赖 npm） */
ipcMain.handle('integrations:ensurePlugin', async (_event, pluginId: string) => {
  const deps = { getOpenclawConfigDir, readOpenclawConfig, writeOpenclawConfig }
  const result = await ensurePlugin(deps, pluginId)
  return { success: !result.error, installed: result.installed, error: result.error }
})

/** 执行 openclaw channels add（用于 QQ 等需 CLI 绑定的渠道） */
ipcMain.handle('integrations:runChannelsAdd', async (_event, channel: string, token: string) => {
  const openclawDir = getOpenclawProjectRoot()
  const configPath = getOpenclawConfigPath()
  const stateDir = getOpenclawConfigDir()
  const { nodeDir } = getNodeExecutablePath()
  const baseEnv: Record<string, string> = {
    ...process.env,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: stateDir,
    PYTHONIOENCODING: 'utf-8',
    FORCE_COLOR: '0',
  }
  if (nodeDir) baseEnv.PATH = `${nodeDir}${path.delimiter}${baseEnv.PATH || ''}`
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const { nodePath } = getNodeExecutablePath()
    const child = spawn(nodePath, ['openclaw.mjs', 'channels', 'add', '--channel', channel, '--token', token], {
      cwd: openclawDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: baseEnv,
    })
    integrationChildren.add(child)
    child.once('close', () => integrationChildren.delete(child))
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); console.log('[Channels]', d.toString('utf8').trim()) })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); console.error('[Channels]', d.toString('utf8').trim()) })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: stderr || stdout || `退出码 ${code}` })
      }
    })
    child.on('error', (err) => {
      resolve({ success: false, error: String(err) })
    })
  })
})

/** 执行 openclaw pairing approve（用于飞书单聊配对） */
ipcMain.handle('integrations:pairingApprove', async (_event, channel: string, code: string) => {
  const openclawDir = getOpenclawProjectRoot()
  const configPath = getOpenclawConfigPath()
  const stateDir = getOpenclawConfigDir()
  const { nodeDir } = getNodeExecutablePath()
  const baseEnv: Record<string, string> = {
    ...process.env,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: stateDir,
    PYTHONIOENCODING: 'utf-8',
    FORCE_COLOR: '0',
  }
  if (nodeDir) baseEnv.PATH = `${nodeDir}${path.delimiter}${baseEnv.PATH || ''}`
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const { nodePath } = getNodeExecutablePath()
    const child = spawn(nodePath, ['openclaw.mjs', 'pairing', 'approve', channel, code.trim()], {
      cwd: openclawDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: baseEnv,
    })
    integrationChildren.add(child)
    child.once('close', () => integrationChildren.delete(child))
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); console.log('[Pairing]', d.toString('utf8').trim()) })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); console.error('[Pairing]', d.toString('utf8').trim()) })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: stderr || stdout || `退出码 ${code}` })
      }
    })
    child.on('error', (err) => {
      resolve({ success: false, error: String(err) })
    })
  })
})

ipcMain.handle('config:saveProviders', async (_event, providers: ProviderData[], selectedModel?: { providerKey: string; modelId: string }) => {
  try {
    const config = readOpenclawConfig()
    const models = (config.models as Record<string, unknown>) || {}
    const existingProviders = (models.providers as Record<string, Record<string, unknown>>) || {}
    const passedKeys = new Set(providers.filter((p) => p.providerKey).map((p) => p.providerKey))

    // 被删除的 provider：若为百炼/deepseek，记录到 yunyaClaw 不再预置
    for (const key of Object.keys(existingProviders)) {
      if (!passedKeys.has(key) && getDefaultProviderKeys().includes(key)) {
        addDeletedDefaultProvider(key)
      }
    }

    const openclawProviders: Record<string, unknown> = {}
    const providerEnabledMap: Record<string, boolean> = {}

    for (const p of providers) {
      if (!p.providerKey) continue

      const modelDefs = (p.models as Array<{ id: string; input?: string[]; contextWindow?: number; maxTokens?: number; reasoning?: boolean }>).map((m) => {
        const input = Array.isArray(m.input) && m.input.length > 0
          ? m.input.filter((x) => x === 'text' || x === 'image' || x === 'document')
          : ['text']
        const contextWindow = typeof m.contextWindow === 'number' && m.contextWindow > 0 ? m.contextWindow : 200000
        const reasoning = typeof m.reasoning === 'boolean' ? m.reasoning : false
        const rawMaxTokens = typeof m.maxTokens === 'number' && m.maxTokens > 0 ? m.maxTokens : undefined
        const maxTokens = rawMaxTokens != null ? Math.min(rawMaxTokens, contextWindow) : undefined
        return {
          id: m.id,
          name: m.id,
          reasoning,
          input,
          contextWindow,
          ...(maxTokens != null ? { maxTokens } : {}),
        }
      })

      // 百炼/deepseek 未配置 AK 时默认不激活；enabled 存 yunyaClaw.json，OpenClaw schema 不识别该字段
      const isDefaultProvider = getDefaultProviderKeys().includes(p.providerKey)
      const hasApiKey = typeof p.apiKey === 'string' && p.apiKey.trim().length > 0
      const resolvedEnabled = isDefaultProvider && !hasApiKey ? false : (p.enabled !== false)

      openclawProviders[p.providerKey] = {
        baseUrl: p.baseUrl,
        ...(p.apiKey ? { apiKey: p.apiKey } : {}),
        api: p.api || 'openai-completions',
        models: modelDefs,
      }
      providerEnabledMap[p.providerKey] = resolvedEnabled
    }

    await YunyaClawConfigService.update({ providerEnabled: providerEnabledMap })

    // 只保留用户当前配置的 providers，删除的不再保留
    config.models = {
      ...models,
      mode: 'merge',
      providers: openclawProviders,
    }

    // 持久化当前选中的模型到 agents.defaults.model
    if (selectedModel?.providerKey && selectedModel?.modelId) {
      const agentsSection = (config.agents as Record<string, unknown>) || {}
      const defaults = (agentsSection.defaults as Record<string, unknown>) || {}
      defaults.model = `${selectedModel.providerKey}/${selectedModel.modelId}`
      agentsSection.defaults = defaults
      config.agents = agentsSection
    }

    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 直接写入 agents.list[].identity（name/emoji/avatar），确保持久化到 openclaw.json */
ipcMain.handle('config:saveAgentIdentity', (_event, agentId: string, identity: { name?: string; emoji?: string; avatar?: string }) => {
  try {
    const config = readOpenclawConfig()
    const agentsSection = (config.agents as Record<string, unknown>) || {}
    let list = Array.isArray(agentsSection.list) ? [...agentsSection.list] : []
    const idx = list.findIndex((a: { id?: string }) => String(a?.id) === agentId)
    const existing = idx >= 0 ? (list[idx] as Record<string, unknown>) : { id: agentId }
    const existingIdentity = (existing.identity as Record<string, unknown>) || {}
    const nextIdentity = { ...existingIdentity }
    if (identity.name !== undefined) nextIdentity.name = identity.name
    if (identity.emoji !== undefined) nextIdentity.emoji = identity.emoji
    if (identity.avatar !== undefined) {
      if (identity.avatar === '') delete nextIdentity.avatar
      else nextIdentity.avatar = identity.avatar
    }
    const entry = { ...existing, identity: nextIdentity }
    if (idx >= 0) {
      list[idx] = entry
    } else {
      if (list.length === 0 && agentId !== 'main') list.push({ id: 'main' })
      list.push(entry)
    }
    agentsSection.list = list
    config.agents = agentsSection
    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

/** 直接写入 agents.list[].model，确保持久化（不依赖 Gateway RPC） */
ipcMain.handle('config:saveAgentModel', (_event, agentId: string, model: string) => {
  try {
    const config = readOpenclawConfig()
    const agentsSection = (config.agents as Record<string, unknown>) || {}
    let list = Array.isArray(agentsSection.list) ? [...agentsSection.list] : []
    const idx = list.findIndex((a: { id?: string }) => String(a?.id) === agentId)
    const entry = idx >= 0 ? { ...list[idx], model } : { id: agentId, model }
    if (idx >= 0) {
      list[idx] = entry
    } else {
      if (list.length === 0 && agentId !== 'main') {
        list.push({ id: 'main' })
      }
      list.push(entry)
    }
    agentsSection.list = list
    config.agents = agentsSection
    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Skills
ipcMain.handle('skills:list', () => {
  try {
    return { success: true, skills: loadAllSkills() }
  } catch (err) {
    return { success: false, skills: [], error: String(err) }
  }
})

ipcMain.handle('skills:toggle', (_event, skillKey: string, enabled: boolean) => {
  try {
    const config = readOpenclawConfig()
    const skillsConfig = (config.skills as Record<string, unknown>) || {}
    const entries = (skillsConfig.entries as Record<string, Record<string, unknown>>) || {}

    entries[skillKey] = { ...(entries[skillKey] || {}), enabled }
    skillsConfig.entries = entries
    config.skills = skillsConfig

    writeOpenclawConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- 环境变量 (.env) ----

function getEnvFilePath(): string {
  return path.join(getOpenclawConfigDir(), '.env')
}

/** 解析 dotenv 格式，返回 key-value 对数组（保留顺序，忽略注释和空行） */
function parseEnvFile(content: string): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = []
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).replace(/^export\s+/, '').trim()
    let val = trimmed.slice(eqIdx + 1)
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    if (key) result.push({ key, value: val })
  }
  return result
}

/** 将 key-value 对序列化回 dotenv 格式（含特殊字符时加双引号） */
function serializeEnvFile(entries: Array<{ key: string; value: string }>): string {
  return entries.map(e => {
    const needsQuote = /[\s=#"\\]|\r|\n/.test(e.value)
    const val = needsQuote ? `"${e.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : e.value
    return `${e.key}=${val}`
  }).join('\n') + '\n'
}

ipcMain.handle('env:read', () => {
  try {
    const p = getEnvFilePath()
    const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
    return { success: true, entries: parseEnvFile(content) }
  } catch (err) {
    return { success: false, entries: [], error: String(err) }
  }
})

ipcMain.handle('env:write', (_event, entries: Array<{ key: string; value: string }>) => {
  try {
    const dir = getOpenclawConfigDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const p = getEnvFilePath()
    fs.writeFileSync(p, serializeEnvFile(entries), { encoding: 'utf-8', mode: 0o600 })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- 备份恢复：仅配置相关文件 ----
const CONFIG_BACKUP_FILES = [
  'openclaw.json',
  'yunyaClaw.json',
  '.env',
]

function collectConfigPaths(configDir: string): Array<{ src: string; arc: string }> {
  const entries: Array<{ src: string; arc: string }> = []
  for (const name of CONFIG_BACKUP_FILES) {
    const p = path.join(configDir, name)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      entries.push({ src: p, arc: name })
    }
  }
  // workspace/*.md
  const workspaceDir = path.join(configDir, 'workspace')
  if (fs.existsSync(workspaceDir)) {
    const files = fs.readdirSync(workspaceDir)
    for (const f of files) {
      if (f.endsWith('.md')) {
        const p = path.join(workspaceDir, f)
        if (fs.statSync(p).isFile()) {
          entries.push({ src: p, arc: `workspace/${f}` })
        }
      }
    }
  }
  // workspaces/<id>/*.md
  const workspacesDir = path.join(configDir, 'workspaces')
  if (fs.existsSync(workspacesDir)) {
    const ids = fs.readdirSync(workspacesDir)
    for (const id of ids) {
      const agentDir = path.join(workspacesDir, id)
      if (fs.statSync(agentDir).isDirectory()) {
        const files = fs.readdirSync(agentDir)
        for (const f of files) {
          if (f.endsWith('.md')) {
            const p = path.join(agentDir, f)
            if (fs.statSync(p).isFile()) {
              entries.push({ src: p, arc: `workspaces/${id}/${f}` })
            }
          }
        }
      }
    }
  }
  // cron/jobs.json
  const cronJobsPath = path.join(configDir, 'cron', 'jobs.json')
  if (fs.existsSync(cronJobsPath) && fs.statSync(cronJobsPath).isFile()) {
    entries.push({ src: cronJobsPath, arc: 'cron/jobs.json' })
  }
  // agents/<id>/agent/models.json
  const agentsDir = path.join(configDir, 'agents')
  if (fs.existsSync(agentsDir)) {
    const agentIds = fs.readdirSync(agentsDir)
    for (const id of agentIds) {
      const agentSubDir = path.join(agentsDir, id, 'agent')
      const modelsPath = path.join(agentSubDir, 'models.json')
      if (fs.existsSync(modelsPath) && fs.statSync(modelsPath).isFile()) {
        entries.push({ src: modelsPath, arc: `agents/${id}/agent/models.json` })
      }
    }
  }
  // settings/*.json（tts、voicewake 等）
  const settingsDir = path.join(configDir, 'settings')
  if (fs.existsSync(settingsDir)) {
    const files = fs.readdirSync(settingsDir)
    for (const f of files) {
      if (f.endsWith('.json')) {
        const p = path.join(settingsDir, f)
        if (fs.statSync(p).isFile()) {
          entries.push({ src: p, arc: `settings/${f}` })
        }
      }
    }
  }
  // exec-approvals.json
  const execApprovalsPath = path.join(configDir, 'exec-approvals.json')
  if (fs.existsSync(execApprovalsPath) && fs.statSync(execApprovalsPath).isFile()) {
    entries.push({ src: execApprovalsPath, arc: 'exec-approvals.json' })
  }
  // 自定义应用图标
  const iconPath = getAppearanceIconPath()
  if (fs.existsSync(iconPath) && fs.statSync(iconPath).isFile()) {
    entries.push({ src: iconPath, arc: '.yunya-claw-icon.png' })
  }
  // credentials/（channel 凭证等，仅 json）
  const credsDir = path.join(configDir, 'credentials')
  if (fs.existsSync(credsDir)) {
    const addCredsRecursive = (dir: string, rel: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of items) {
        const srcPath = path.join(dir, e.name)
        const arcPath = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) {
          addCredsRecursive(srcPath, arcPath)
        } else if (e.name.endsWith('.json')) {
          entries.push({ src: srcPath, arc: `credentials/${arcPath}` })
        }
      }
    }
    addCredsRecursive(credsDir, '')
  }
  return entries
}

ipcMain.handle('backup:create', async () => {
  try {
    const configDir = getOpenclawConfigDir()
    const entries = collectConfigPaths(configDir)
    if (entries.length === 0) {
      return { success: false, error: '没有可备份的配置文件' }
    }
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, {
          defaultPath: `yunya-claw-backup-${stamp}.zip`,
          filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
        })
      : await dialog.showSaveDialog({
          defaultPath: `yunya-claw-backup-${stamp}.zip`,
          filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
        })
    if (canceled || !filePath) return { success: true, canceled: true }
    const output = fs.createWriteStream(filePath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      for (const { src, arc } of entries) {
        archive.file(src, { name: arc })
      }
      archive.finalize()
    })
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('backup:restore', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
        })
    if (canceled || !filePaths?.length) return { success: true, canceled: true }
    const zipPath = filePaths[0]
    const configDir = getOpenclawConfigDir()
    const tmpDir = path.join(os.tmpdir(), `yunya-restore-${Date.now()}`)
    fs.mkdirSync(tmpDir, { recursive: true })
    try {
      await extractZipBuffer(fs.readFileSync(zipPath), tmpDir)
      // 复制回 configDir，保持相对路径
      const copyRecursive = (src: string, destBase: string, rel = '') => {
        const entries = fs.readdirSync(src, { withFileTypes: true })
        for (const e of entries) {
          const srcPath = path.join(src, e.name)
          const destPath = path.join(destBase, rel, e.name)
          if (e.isDirectory()) {
            if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
            copyRecursive(srcPath, destBase, path.join(rel, e.name))
          } else {
            const destDir = path.dirname(destPath)
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
            fs.copyFileSync(srcPath, destPath)
          }
        }
      }
      const extracted = fs.readdirSync(tmpDir)
      if (extracted.length === 1) {
        const sub = path.join(tmpDir, extracted[0])
        if (fs.statSync(sub).isDirectory()) {
          copyRecursive(sub, configDir)
        } else {
          fs.copyFileSync(sub, path.join(configDir, extracted[0]))
        }
      } else {
        copyRecursive(tmpDir, configDir)
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch { /* 忽略 */ }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ---- Skills 安装 ----

function getManagedSkillsDir(): string {
  return path.join(getOpenclawConfigDir(), 'skills')
}

/** 确保 managed skills 目录存在 */
function ensureManagedSkillsDir(): string {
  const dir = getManagedSkillsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 从 Buffer 中解析 zip，提取到目标目录（不依赖第三方库，使用 Node 内置） */
async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  // 动态 import yauzl-promise（若无则 fallback）
  // 因 Electron 主进程可以用 require，直接用内置方式：
  // ZIP 格式：End of Central Directory 在文件末尾，向前扫描 EOCD
  // 这里用 spawn unzip（跨平台用 PowerShell Expand-Archive）简化实现

  const tmpZip = path.join(os.tmpdir(), `skill-install-${Date.now()}.zip`)
  fs.writeFileSync(tmpZip, buffer)

  await new Promise<void>((resolve, reject) => {
    if (process.platform === 'win32') {
      // PowerShell Expand-Archive
      const ps = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Path '${tmpZip}' -DestinationPath '${destDir}' -Force`,
      ], { shell: false, windowsHide: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ps as any).on('close', (code: number | null) => {
        code === 0 ? resolve() : reject(new Error(`Expand-Archive 失败，退出码: ${code}`))
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ps as any).on('error', reject)
    } else {
      execFile('unzip', ['-o', tmpZip, '-d', destDir], (err) => {
        err ? reject(err) : resolve()
      })
    }
  })

  try { fs.unlinkSync(tmpZip) } catch { /* 忽略清理失败 */ }
}

/** 下载 URL 到 Buffer */
function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const request = (targetUrl: string) => {
      protocol.get(targetUrl, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${targetUrl}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

/**
 * 解析 GitHub URL，返回 zip 下载地址和期望的安装目录名。
 * 支持格式：
 *   https://github.com/user/repo
 *   https://github.com/user/repo/tree/branch
 *   https://github.com/user/repo/tree/branch/subdir
 *   user/repo（简写）
 */
function parseGithubUrl(input: string): { zipUrl: string; dirName: string } {
  let str = input.trim()

  // 简写 user/repo 或 user/repo.git
  if (!str.startsWith('http') && str.includes('/')) {
    str = `https://github.com/${str}`
  }
  // 去掉 URL 里 repo 后的 .git（例如 https://github.com/user/repo.git）
  str = str.replace(/\.git(\/|$)/, '$1')

  const url = new URL(str)
  const parts = url.pathname.split('/').filter(Boolean)
  // parts: [user, repo, 'tree', branch, ...subpath]
  const user = parts[0]
  const repo = (parts[1] || '').replace(/\.git$/i, '')  // 去掉 .git 后缀
  const branch = parts[3] || 'main'
  // subPath 保留用于将来支持子目录安装

  if (!user || !repo) throw new Error('无效的 GitHub 地址')

  const zipUrl = `https://github.com/${user}/${repo}/archive/refs/heads/${branch}.zip`
  const dirName = repo
  return { zipUrl, dirName }
}

ipcMain.handle('skills:installZip', async (_event, zipBase64: string, fileName: string) => {
  try {
    const buffer = Buffer.from(zipBase64, 'base64')
    const managedDir = ensureManagedSkillsDir()

    // 解压到临时目录，再移动到 managed/skills/<skill-name>
    const tmpExtract = path.join(os.tmpdir(), `skill-extract-${Date.now()}`)
    fs.mkdirSync(tmpExtract, { recursive: true })

    await extractZipBuffer(buffer, tmpExtract)

    // 找到解压出来的顶层目录（zip 通常会有一个根目录）
    const extracted = fs.readdirSync(tmpExtract)
    let skillSrc = tmpExtract

    if (extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()) {
      skillSrc = path.join(tmpExtract, extracted[0])
    }

    // 取 skill 名：优先读 SKILL.md 的 name，否则用 zip 文件名
    let skillName = path.basename(fileName, '.zip')
    const skillMdPath = path.join(skillSrc, 'SKILL.md')
    if (fs.existsSync(skillMdPath)) {
      const md = fs.readFileSync(skillMdPath, 'utf-8')
      const m = md.match(/^name:\s*(.+)$/m)
      if (m) skillName = m[1].trim().replace(/^["']|["']$/g, '')
    }

    const destDir = path.join(managedDir, skillName)
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
    fs.renameSync(skillSrc, destDir)

    try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch { /* 忽略 */ }

    return { success: true, skillName }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('skills:installGithub', async (_event, githubUrl: string) => {
  try {
    const { zipUrl, dirName } = parseGithubUrl(githubUrl)
    const managedDir = ensureManagedSkillsDir()

    console.log(`[Skills] 下载 GitHub zip: ${zipUrl}`)
    let buffer: Buffer
    try {
      buffer = await downloadToBuffer(zipUrl)
    } catch {
      // main 分支失败，尝试 master
      const masterUrl = zipUrl.replace('/heads/main.zip', '/heads/master.zip')
      console.log(`[Skills] 重试 master 分支: ${masterUrl}`)
      buffer = await downloadToBuffer(masterUrl)
    }

    const tmpExtract = path.join(os.tmpdir(), `skill-gh-${Date.now()}`)
    fs.mkdirSync(tmpExtract, { recursive: true })
    await extractZipBuffer(buffer, tmpExtract)

    // GitHub 解压后目录名为 repo-branch，找到它
    const extracted = fs.readdirSync(tmpExtract)
    let skillSrc = tmpExtract
    if (extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()) {
      skillSrc = path.join(tmpExtract, extracted[0])
    }

    // 读取 SKILL.md 确定技能名
    let skillName = dirName
    const skillMdPath = path.join(skillSrc, 'SKILL.md')
    if (fs.existsSync(skillMdPath)) {
      const md = fs.readFileSync(skillMdPath, 'utf-8')
      const m = md.match(/^name:\s*(.+)$/m)
      if (m) skillName = m[1].trim().replace(/^["']|["']$/g, '')
    }

    const destDir = path.join(managedDir, skillName)
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
    fs.renameSync(skillSrc, destDir)

    try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch { /* 忽略 */ }

    return { success: true, skillName }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

interface ProviderData {
  providerKey: string
  name: string
  apiKey: string
  baseUrl: string
  enabled: boolean
  models: Array<{ id: string; input?: string[] }>
  api: string
  website?: string
}

// ---- App Lifecycle ----

// Windows: 设置 AppUserModelId，确保任务栏图标正确关联
if (process.platform === 'win32') {
  app.setAppUserModelId('ai.yunya.claw')
}

app.whenReady().then(async () => {
  debugLog('[App] started', 'isPackaged:', app.isPackaged, 'resourcesPath:', process.resourcesPath)
  ensureProviderWebsites()
  runAllMigrations({ readOpenclawConfig, writeOpenclawConfig, readYunyaClawConfigRaw, writeYunyaClawConfigRaw })
  ensureDefaultProviders()
  ensureGatewayConfig()
  ensureBundledSkills({
    getOpenclawConfigDir,
    readOpenclawConfig,
    writeOpenclawConfig,
  })
  createWindow()
  // 自动启动 Gateway
  await startGateway()
})

app.on('window-all-closed', () => {
  stopGateway()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

let appQuitting = false
app.on('before-quit', (event) => {
  if (appQuitting) return
  event.preventDefault()
  appQuitting = true

  const killIntegrationChildren = (): Promise<void> => {
    const children = [...integrationChildren]
    integrationChildren.clear()
    if (children.length === 0) return Promise.resolve()
    return new Promise((resolve) => {
      let pending = children.length
      const onDone = () => {
        if (--pending <= 0) resolve()
      }
      for (const proc of children) {
        try {
          if (process.platform === 'win32' && proc.pid) {
            const tk = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
            tk.on('close', onDone)
            tk.on('error', onDone)
          } else {
            proc.kill('SIGTERM')
            proc.once('exit', onDone)
            setTimeout(onDone, 2000)
          }
        } catch {
          onDone()
        }
      }
    })
  }

  killIntegrationChildren()
    .then(() => stopGateway())
    .then(() => app.exit(0))
})
