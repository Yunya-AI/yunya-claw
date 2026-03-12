#!/usr/bin/env node
/**
 * Mini 版 openclaw 发行产物构建：直接从 npm registry 安装 openclaw，不构建本地子模块
 *
 * 与 build-openclaw-release.mjs 的区别：
 *   - 跳过 pnpm build / pnpm ui:build
 *   - 跳过本地产物覆盖
 *   - 直接 npm install openclaw@<version>，使用 registry 上的正式发布版
 *
 * 适用场景：快速打包、CI 验证、不依赖本地 openclaw 子模块构建环境
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const openclawDir = path.join(root, 'openclaw')
const releaseDir = path.join(root, 'resources', 'openclaw-release')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || root,
    shell: process.platform === 'win32',
    ...opts,
  })
  if (r.status !== 0) {
    console.error(`[build-openclaw-release-mini] 命令失败: ${cmd} ${args.join(' ')} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

function main() {
  // 读取 openclaw 版本号（从子模块 package.json 获取，子模块不存在时报错提示）
  const openclawPkgPath = path.join(openclawDir, 'package.json')
  if (!fs.existsSync(openclawPkgPath)) {
    console.error('[build-openclaw-release-mini] 找不到 openclaw/package.json，请先初始化 submodule: git submodule update --init')
    process.exit(1)
  }
  const openclawPkg = JSON.parse(fs.readFileSync(openclawPkgPath, 'utf-8'))
  const openclawVersion = openclawPkg.version
  console.log(`[build-openclaw-release-mini] openclaw 版本: ${openclawVersion}`)

  // 创建 releaseDir，写入独立 package.json，npm install 直接安装 registry 版本
  console.log('[build-openclaw-release-mini] 初始化 releaseDir 并从 registry 安装 openclaw...')
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true })
  }
  fs.mkdirSync(releaseDir, { recursive: true })

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

  run('npm', ['install', '--ignore-scripts'], { cwd: releaseDir })

  // 删除巨型可选包，大幅缩减安装包体积
  console.log('[build-openclaw-release-mini] 清理巨型可选包...')
  const bloatPackages = [
    '@node-llama-cpp/win-x64-cuda-ext',
    '@node-llama-cpp/win-x64-cuda',
    '@node-llama-cpp/win-x64-vulkan',
    '@node-llama-cpp/win-arm64',
    '@node-llama-cpp/linux-x64-cuda',
    '@node-llama-cpp/linux-x64-cuda-ext',
    '@node-llama-cpp/linux-arm64-cuda',
    '@node-llama-cpp/darwin-arm64',
    '@node-llama-cpp/darwin-x64',
    '@node-llama-cpp/linux-x64',
    '@node-llama-cpp/linux-arm64',
    '@cloudflare/workers-types',
    'bun-types',
  ]
  const nmDir = path.join(releaseDir, 'node_modules')
  for (const pkg of bloatPackages) {
    const pkgPath = path.join(nmDir, pkg)
    if (fs.existsSync(pkgPath)) {
      fs.rmSync(pkgPath, { recursive: true, force: true })
      console.log('  删除:', pkg)
    }
  }

  console.log('[build-openclaw-release-mini] 完成，发行产物位于', releaseDir)
  console.log('[build-openclaw-release-mini] 结构: node_modules/openclaw/ (入口: openclaw.mjs)')
}

main()
