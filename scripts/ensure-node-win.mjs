#!/usr/bin/env node
/**
 * 下载 Node.js 22 到 resources/node-win，供 Windows 打包时嵌入
 * 目标机器无需安装 Node 即可运行 Gateway
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const NODE_VERSION = 'v22.22.1'
const NODE_ZIP = `node-${NODE_VERSION}-win-x64.zip`
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_ZIP}`
const NODE_WIN_DIR = path.join(root, 'resources', 'node-win')
const EXTRACT_DIR = path.join(root, 'resources', '.node-win-extract')
const ZIP_PATH = path.join(root, 'resources', `.${NODE_ZIP}`)

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  fs.writeFileSync(ZIP_PATH, Buffer.from(buf))
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[ensure-node-win] 非 Windows，创建空占位目录以通过 extraResources')
    fs.mkdirSync(NODE_WIN_DIR, { recursive: true })
    fs.writeFileSync(path.join(NODE_WIN_DIR, '.gitkeep'), '', 'utf-8')
    return
  }

  if (fs.existsSync(path.join(NODE_WIN_DIR, 'node.exe'))) {
    console.log('[ensure-node-win] resources/node-win/node.exe 已存在，跳过')
    return
  }

  console.log('[ensure-node-win] 下载 Node.js', NODE_VERSION, '...')
  fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true })
  try {
    await download(NODE_URL)
  } catch (err) {
    console.error('[ensure-node-win] 下载失败:', err.message)
    process.exit(1)
  }

  try {
    console.log('[ensure-node-win] 解压到', NODE_WIN_DIR)
    if (fs.existsSync(EXTRACT_DIR)) fs.rmSync(EXTRACT_DIR, { recursive: true })
    if (fs.existsSync(NODE_WIN_DIR)) fs.rmSync(NODE_WIN_DIR, { recursive: true })
    fs.mkdirSync(EXTRACT_DIR, { recursive: true })

    const r = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${ZIP_PATH.replace(/'/g, "''")}' -DestinationPath '${EXTRACT_DIR.replace(/'/g, "''")}' -Force`
    ], { stdio: 'inherit' })

    if (r.status !== 0) {
      console.error('[ensure-node-win] 解压失败')
      process.exit(1)
    }

    const extracted = path.join(EXTRACT_DIR, `node-${NODE_VERSION}-win-x64`)
    if (!fs.existsSync(extracted)) {
      const dirs = fs.readdirSync(EXTRACT_DIR)
      console.error('[ensure-node-win] 解压目录异常，期望', extracted, '实际', dirs)
      process.exit(1)
    }

    fs.renameSync(extracted, NODE_WIN_DIR)
    fs.rmSync(EXTRACT_DIR, { recursive: true })
    fs.unlinkSync(ZIP_PATH)

    console.log('[ensure-node-win] 完成，node.exe 位于', path.join(NODE_WIN_DIR, 'node.exe'))
  } catch (err) {
    console.error('[ensure-node-win] 解压失败:', err.message)
    process.exit(1)
  }
}

main()
