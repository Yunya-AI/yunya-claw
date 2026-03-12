#!/usr/bin/env node
/**
 * 打包前清理 release-out 目录，避免 electron-builder 因旧 exe 被占用而失败
 * 输出目录已改为 release-out，避免与可能被占用的 release 冲突
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releaseOutDir = path.join(__dirname, '..', 'release-out')

if (!fs.existsSync(releaseOutDir)) {
  console.log('[clean-release] release-out 目录不存在，跳过')
  process.exit(0)
}

try {
  fs.rmSync(releaseOutDir, { recursive: true })
  console.log('[clean-release] 已清理 release-out 目录')
} catch (err) {
  const msg = String(err?.message || err)
  console.error('[clean-release] 清理失败:', msg)
  if (err?.code === 'EBUSY' || err?.code === 'EPERM' || msg.includes('Access is denied') || msg.includes('拒绝访问') || msg.includes('正在使用')) {
    console.error('  请关闭资源管理器中打开的 release-out 文件夹，或重启 Cursor 后重试')
  }
  process.exit(1)
}
