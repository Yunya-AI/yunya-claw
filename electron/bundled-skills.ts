/**
 * 内置技能按需管理
 * 打包时预置在 app 资源中，初次启动时从内置包复制到 ~/.openclaw/skills/
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const BUNDLED_SKILL_IDS = ['playwright-mcp', 'self-improvement']

/** 解析内置技能路径：打包后为 resourcesPath/bundled-skills，开发时为 appPath/resources/bundled-skills */
function resolveBundledSkillPath(skillId: string): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'bundled-skills', skillId),
    path.join(appPath, 'bundled-skills', skillId),
    path.join(appPath, 'resources', 'bundled-skills', skillId),
    path.join(appPath, '..', 'resources', 'bundled-skills', skillId),
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

export type EnsureBundledSkillsDeps = {
  getOpenclawConfigDir: () => string
  readOpenclawConfig: () => Record<string, unknown>
  writeOpenclawConfig: (config: Record<string, unknown>) => void
}

/**
 * 初次启动时确保内置技能已安装。若已存在则跳过，否则从内置包复制到 skills。
 */
export function ensureBundledSkills(deps: EnsureBundledSkillsDeps): void {
  const skillsDir = path.join(deps.getOpenclawConfigDir(), 'skills')
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })

  for (const skillId of BUNDLED_SKILL_IDS) {
    const targetPath = path.join(skillsDir, skillId)
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) continue

    const bundledPath = resolveBundledSkillPath(skillId)
    if (!bundledPath) {
      console.warn(`[Skills] 内置技能 ${skillId} 未找到，请运行 pnpm prebuild`)
      continue
    }

    try {
      copyDirRecursive(bundledPath, targetPath)
      const config = deps.readOpenclawConfig()
      const skills = (config.skills as Record<string, unknown>) || {}
      const entries = (skills.entries as Record<string, Record<string, unknown>>) || {}
      if (!entries[skillId]) {
        entries[skillId] = { enabled: true }
        skills.entries = entries
        deps.writeOpenclawConfig(config)
      }
      console.log(`[Skills] ${skillId} 已就绪（内置复制）`)
    } catch (err) {
      console.error(`[Skills] 复制 ${skillId} 失败:`, err)
    }
  }
}
