#!/usr/bin/env node
/**
 * 检查 openclaw/dist/entry.js 是否存在，不存在则自动构建
 * 用于 predev，避免开发时忘记构建 openclaw 导致页面卡在"启动中"
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const openclawDir = path.join(root, 'openclaw')
const entryFile = path.join(openclawDir, 'dist', 'entry.js')
const nodeModulesDir = path.join(openclawDir, 'node_modules')

function run(cmd, args, cwd) {
  console.log(`[ensure-openclaw] 运行: ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.error(`[ensure-openclaw] 命令失败: ${cmd} ${args.join(' ')}`)
    process.exit(1)
  }
}

if (!fs.existsSync(entryFile)) {
  console.log('[ensure-openclaw] openclaw/dist/entry.js 不存在，开始构建...')

  if (!fs.existsSync(nodeModulesDir)) {
    console.log('[ensure-openclaw] 安装依赖...')
    run('pnpm', ['install', '--frozen-lockfile'], openclawDir)
  }

  run('pnpm', ['build'], openclawDir)

  if (!fs.existsSync(entryFile)) {
    console.error('[ensure-openclaw] 构建完成但 dist/entry.js 仍不存在，请检查构建日志')
    process.exit(1)
  }

  console.log('[ensure-openclaw] openclaw 构建完成')
} else {
  console.log('[ensure-openclaw] openclaw/dist/entry.js 已存在，跳过构建')
}
