/**
 * 内置插件按需管理
 * 打包时预置在 app 资源中，用户保存接入配置时从内置包复制到 ~/.openclaw/extensions/
 * 不依赖 npm，适用于无 npm 环境
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface BundledPluginDef {
  id: string
  npmPackage: string
}

const BUNDLED_PLUGINS: BundledPluginDef[] = [
  { id: 'qqbot', npmPackage: '@sliverp/qqbot@latest' },
  { id: 'dingtalk-connector', npmPackage: '@dingtalk-real-ai/dingtalk-connector@latest' },
  { id: 'openclaw-weixin', npmPackage: '@tencent-weixin/openclaw-weixin@latest' },
]

const PLUGIN_MAP = Object.fromEntries(BUNDLED_PLUGINS.map(p => [p.id, p]))

/** 解析内置插件路径：打包后为 resourcesPath/bundled-plugins，开发时为 appPath/resources/bundled-plugins */
function resolveBundledPluginPath(pluginId: string): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'bundled-plugins', pluginId),
    path.join(appPath, 'bundled-plugins', pluginId),
    path.join(appPath, 'resources', 'bundled-plugins', pluginId),
    path.join(appPath, '..', 'resources', 'bundled-plugins', pluginId),
  ].filter((p): p is string => Boolean(p))
  for (const p of candidates) {
    const resolved = path.resolve(p)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved
  }
  return null
}

function copyDirRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const e of entries) {
    const srcPath = path.join(src, e.name)
    const destPath = path.join(dest, e.name)
    if (e.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export type EnsurePluginDeps = {
  getOpenclawConfigDir: () => string
  readOpenclawConfig: () => Record<string, unknown>
  writeOpenclawConfig: (config: Record<string, unknown>) => void
}

/**
 * 按需确保单个插件已安装。若已存在则跳过，否则从内置包复制到 extensions。
 * 仅使用内置包，不依赖 npm。
 * @returns { installed: true } 表示本次执行了复制
 */
export async function ensurePlugin(deps: EnsurePluginDeps, pluginId: string): Promise<{ installed: boolean; error?: string }> {
  const plugin = PLUGIN_MAP[pluginId]
  if (!plugin) return { installed: false, error: `未知插件: ${pluginId}` }

  const extensionsDir = path.join(deps.getOpenclawConfigDir(), 'extensions')
  const targetPath = path.join(extensionsDir, pluginId)

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    return { installed: false }
  }

  const bundledPath = resolveBundledPluginPath(pluginId)
  if (!bundledPath) {
    return { installed: false, error: `内置插件 ${pluginId} 未找到，请重新安装应用或运行 pnpm prebuild` }
  }

  try {
    if (!fs.existsSync(extensionsDir)) fs.mkdirSync(extensionsDir, { recursive: true })
    copyDirRecursive(bundledPath, targetPath)
    const config = deps.readOpenclawConfig()
    const plugins = (config.plugins as Record<string, unknown>) || {}
    const entries = (plugins.entries as Record<string, unknown>) || {}
    const installs = (plugins.installs as Record<string, unknown>) || {}
    if (!entries[pluginId]) {
      entries[pluginId] = { enabled: true }
      plugins.entries = entries
    }
    if (!installs[pluginId]) {
      installs[pluginId] = { source: 'path', sourcePath: targetPath, installPath: targetPath }
      plugins.installs = installs
    }
    deps.writeOpenclawConfig(config)
    console.log(`[Plugins] ${pluginId} 已就绪（内置复制）`)
    return { installed: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Plugins] 复制 ${pluginId} 失败:`, err)
    return { installed: false, error: msg }
  }
}
