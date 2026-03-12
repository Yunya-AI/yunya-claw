#!/usr/bin/env node
/**
 * 终止占用 release 目录的进程
 * - 主进程：YunyaClaw.exe、云涯小虾.exe
 * - 子进程：node.exe 运行 openclaw gateway 的（cwd 或命令行含 release/openclaw）
 * 执行 build:win 前若遇到「文件夹正在使用」，可先运行此脚本
 */
import { spawnSync } from 'node:child_process'

const PROCESS_NAMES = ['YunyaClaw.exe', '云涯小虾.exe']
const SELF_PID = process.pid

function killProcess(name) {
  const r = spawnSync('taskkill', ['/IM', name, '/F', '/T'], {
    stdio: 'pipe',
    windowsHide: true,
  })
  if (r.status === 0) {
    console.log('[kill-release-lock] 已终止:', name)
    return true
  }
  return false
}

/** 终止命令行含 openclaw 或 release 的 node.exe（Gateway 子进程等），排除当前脚本 */
function killNodeWithOpenclawOrRelease() {
  const ps = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
      $cmd = $_.CommandLine ?? ''
      $procId = $_.ProcessId
      if ($procId -eq ${SELF_PID}) { return }
      if ($cmd -match 'openclaw|release\\\\win-unpacked') {
        Write-Output $procId
      }
    }`
  ], { stdio: 'pipe', encoding: 'utf-8', windowsHide: true })

  const pids = (ps.stdout || '').trim().split(/\s+/).filter(Boolean)
  for (const pid of pids) {
    const r = spawnSync('taskkill', ['/PID', pid, '/F', '/T'], {
      stdio: 'pipe',
      windowsHide: true,
    })
    if (r.status === 0) {
      console.log('[kill-release-lock] 已终止 node 子进程 PID:', pid)
    }
  }
  return pids.length
}

function main() {
  if (process.platform !== 'win32') {
    console.log('[kill-release-lock] 仅 Windows 支持')
    process.exit(0)
  }

  let killed = 0
  for (const name of PROCESS_NAMES) {
    if (killProcess(name)) killed++
  }
  killed += killNodeWithOpenclawOrRelease()

  if (killed === 0) {
    console.log('[kill-release-lock] 未发现占用进程')
    console.log('[kill-release-lock] 若仍无法删除 release，请关闭资源管理器中打开的 release 文件夹后重试')
  }
}

main()
