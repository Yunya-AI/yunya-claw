#!/usr/bin/env node
/**
 * 构建时预打包内置插件到 resources/bundled-plugins/
 * 用户电脑无需 npm，运行时从 app 资源复制到 ~/.openclaw/extensions/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const configPath = path.join(__dirname, 'bundled-plugins.config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const destBase = path.join(root, 'resources', 'bundled-plugins')

fs.mkdirSync(destBase, { recursive: true })

for (const p of config.plugins) {
  const pkgParts = p.npmPackage.split('/')
  const src = path.join(root, 'node_modules', ...pkgParts)
  const dest = path.join(destBase, p.id)

  if (!fs.existsSync(src)) {
    console.warn(`[bundle-plugins] ${p.npmPackage} 未安装，请先运行 pnpm add -D ${p.npmPackage}`)
    continue
  }

  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[bundle-plugins] ${p.id} 已复制到`, dest)
}
