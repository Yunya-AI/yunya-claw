#!/usr/bin/env node
/**
 * 将 openclaw 构建为可运行发行产物，输出到 resources/openclaw-release/
 *
 * 参考 QClaw 做法：
 *   1. 在 openclaw/ 子模块中构建（pnpm build + pnpm ui:build）
 *   2. 在 releaseDir 创建独立 package.json，只声明 { "openclaw": "<version>" } 依赖
 *   3. npm install 安装，自动拉取 openclaw 及其全部生产依赖到扁平 node_modules
 *   4. 用本地构建产物覆盖 node_modules/openclaw（dist/ 等），保证使用最新本地代码
 *
 * 最终结构（对应 extraResources to: "openclaw"）：
 *   resources/openclaw-release/
 *   ├── package.json          { "dependencies": { "openclaw": "<version>" } }
 *   ├── package-lock.json
 *   └── node_modules/
 *       ├── openclaw/         ← 本地构建产物覆盖
 *       │   ├── openclaw.mjs
 *       │   ├── dist/
 *       │   ├── extensions/
 *       │   ├── skills/
 *       │   └── assets/
 *       └── [所有生产依赖]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const openclawDir = path.join(root, 'openclaw')
const releaseDir = path.join(root, 'resources', 'openclaw-release')

/**
 * 安装后需要整包删除的可选包（非 win-x64 平台包 / 运行时不需要的包）
 * QClaw 打包时同样不包含这些
 */
const BLOAT_PACKAGES = [
  // node-llama-cpp 本地 LLM：所有非 win-x64 平台，以及 CUDA/Vulkan 加速版（按需下载）
  '@node-llama-cpp/win-x64-cuda-ext',
  '@node-llama-cpp/win-x64-cuda',
  '@node-llama-cpp/win-x64-vulkan',
  '@node-llama-cpp/win-arm64',
  '@node-llama-cpp/linux-x64-cuda',
  '@node-llama-cpp/linux-x64-cuda-ext',
  '@node-llama-cpp/linux-arm64-cuda',
  '@node-llama-cpp/linux-x64-cuda-ext',
  '@node-llama-cpp/darwin-arm64',
  '@node-llama-cpp/darwin-x64',
  '@node-llama-cpp/linux-x64',
  '@node-llama-cpp/linux-arm64',
  // 纯类型定义包，运行时不需要
  '@cloudflare/workers-types',
  'bun-types',
]


/** openclaw 运行时必需的文件/目录（覆盖到 node_modules/openclaw/） */
const RUNTIME_ENTRIES = [
  'openclaw.mjs',
  'package.json',
  'dist',
  'extensions',
  'skills',
  'assets',
  'docs',
]

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || root,
    shell: process.platform === 'win32',
    ...opts,
  })
  if (r.status !== 0) {
    console.error(`[build-openclaw-release] 命令失败: ${cmd} ${args.join(' ')} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

function main() {
  if (!fs.existsSync(openclawDir)) {
    console.error('[build-openclaw-release] openclaw 目录不存在，请先初始化 submodule: git submodule update --init')
    process.exit(1)
  }

  // 读取 openclaw 版本号
  const openclawPkg = JSON.parse(fs.readFileSync(path.join(openclawDir, 'package.json'), 'utf-8'))
  const openclawVersion = openclawPkg.version
  console.log(`[build-openclaw-release] openclaw 版本: ${openclawVersion}`)

  // 0. 清理旧的 dist（避免 Windows 文件锁定导致 rolldown 写入失败）
  console.log('[build-openclaw-release] 0/4 清理 openclaw/dist...')
  const openclawDist = path.join(openclawDir, 'dist')
  if (fs.existsSync(openclawDist)) {
    try {
      fs.rmSync(openclawDist, { recursive: true })
    } catch (e) {
      console.warn('[build-openclaw-release] 清理 dist 失败（可能有进程占用）:', e.message)
    }
  }

  // 1. 构建 openclaw
  console.log('[build-openclaw-release] 1/4 构建 openclaw...')
  run('pnpm', ['build'], { cwd: openclawDir })

  // 2. 构建 Control UI
  console.log('[build-openclaw-release] 2/4 构建 Control UI...')
  run('pnpm', ['ui:build'], { cwd: openclawDir })

  if (!fs.existsSync(path.join(openclawDir, 'dist', 'entry.js'))) {
    console.error('[build-openclaw-release] 构建失败: dist/entry.js 不存在')
    process.exit(1)
  }

  // 3. 创建 releaseDir，写入独立 package.json，npm install 安装所有依赖
  console.log('[build-openclaw-release] 3/4 初始化 releaseDir 并安装依赖...')
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true })
  }
  fs.mkdirSync(releaseDir, { recursive: true })

  // 写入只含 openclaw 依赖的 package.json（与 QClaw 做法一致）
  const releasePkg = {
    name: 'yunya-claw-openclaw',
    version: '0.0.1',
    private: true,
    dependencies: {
      openclaw: openclawVersion,
    },
  }
  fs.writeFileSync(
    path.join(releaseDir, 'package.json'),
    JSON.stringify(releasePkg, null, 2),
    'utf-8'
  )

  // npm install 安装 openclaw 及其全部生产依赖（扁平 node_modules）
  run('npm', ['install', '--ignore-scripts'], { cwd: releaseDir })

  // 3.5 删除巨型可选包，大幅缩减安装包体积
  console.log('[build-openclaw-release] 3.5/4 清理巨型可选包...')
  const nmDir = path.join(releaseDir, 'node_modules')
  for (const pkg of BLOAT_PACKAGES) {
    const pkgPath = path.join(nmDir, pkg)
    if (fs.existsSync(pkgPath)) {
      fs.rmSync(pkgPath, { recursive: true, force: true })
      console.log('  删除:', pkg)
    }
  }

  // 4. 用本地构建产物覆盖 node_modules/openclaw（确保使用最新本地代码而非 registry 版本）
  console.log('[build-openclaw-release] 4/4 用本地构建产物覆盖 node_modules/openclaw...')
  const destOpenclawDir = path.join(releaseDir, 'node_modules', 'openclaw')

  for (const entry of RUNTIME_ENTRIES) {
    const src = path.join(openclawDir, entry)
    const dest = path.join(destOpenclawDir, entry)
    if (!fs.existsSync(src)) {
      if (entry === 'extensions' || entry === 'skills' || entry === 'assets') {
        fs.mkdirSync(dest, { recursive: true })
      } else {
        console.warn('[build-openclaw-release] 跳过不存在的:', entry)
      }
      continue
    }
    // 先删除旧的再复制，避免残留文件
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    copyRecursive(src, dest)
    console.log('  覆盖:', entry)
  }

  console.log('[build-openclaw-release] 完成，发行产物位于', releaseDir)
  console.log('[build-openclaw-release] 结构: node_modules/openclaw/ (入口: openclaw.mjs)')
}

main()
