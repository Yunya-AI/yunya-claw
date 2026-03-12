/**
 * 配置迁移：openclaw.json ↔ yunyaClaw.json
 *
 * OpenClaw 的 schema 对 providers 下的字段有严格校验，不识别 `enabled` 等扩展字段。
 * YunyaClaw 将这类字段存在 yunyaClaw.json 中，启动时通过 config:read 合并后返回给前端。
 *
 * 本模块负责：
 * 1. migrateProviderEnabledToYunyaClaw —— 将旧版写入 openclaw.json 的 provider.enabled
 *    迁移到 yunyaClaw.json，并从 openclaw.json 中删除，避免 OpenClaw schema 报错。
 */

export interface ConfigMigrationDeps {
  readOpenclawConfig: () => Record<string, unknown>
  writeOpenclawConfig: (config: Record<string, unknown>) => void
  readYunyaClawConfigRaw: () => Record<string, unknown>
  writeYunyaClawConfigRaw: (config: Record<string, unknown>) => void
}

/**
 * 将 openclaw.json 中 models.providers.*.enabled 迁移到 yunyaClaw.json 的 providerEnabled。
 *
 * 背景：旧版本的 ensureDefaultProviders 会把 `enabled: false` 写入 openclaw.json，
 * 但 OpenClaw schema 不识别该字段，导致启动时报 "Unrecognized key: enabled" 错误。
 * 现在 enabled 统一存放在 yunyaClaw.json 的 providerEnabled 对象中。
 *
 * 迁移规则：
 * - 若 yunyaClaw.json 中已有该 provider 的 enabled 值，保留已有值（不覆盖用户设置）
 * - 若 yunyaClaw.json 中没有，则从 openclaw.json 迁移过来
 * - 无论是否迁移，都从 openclaw.json 中删除 enabled 字段
 */
export function migrateProviderEnabledToYunyaClaw(deps: ConfigMigrationDeps): void {
  const { readOpenclawConfig, writeOpenclawConfig, readYunyaClawConfigRaw, writeYunyaClawConfigRaw } = deps

  const config = readOpenclawConfig()
  const models = (config.models as Record<string, unknown>) || {}
  const providers = (models.providers as Record<string, Record<string, unknown>>) || {}
  const yc = readYunyaClawConfigRaw()
  const providerEnabled = (yc.providerEnabled as Record<string, boolean>) || {}

  let configChanged = false
  let ycChanged = false

  for (const [key, p] of Object.entries(providers)) {
    if (!p || typeof p !== 'object') continue
    if ('enabled' in p) {
      if (providerEnabled[key] === undefined) {
        providerEnabled[key] = p.enabled !== false
        ycChanged = true
      }
      delete p.enabled
      configChanged = true
    }
  }

  if (configChanged) {
    config.models = { ...models, providers }
    writeOpenclawConfig(config)
    console.log('[ConfigMigration] 已将 provider.enabled 从 openclaw.json 迁移到 yunyaClaw.json')
  }
  if (ycChanged) {
    yc.providerEnabled = providerEnabled
    writeYunyaClawConfigRaw(yc)
  }
}

/**
 * 运行所有迁移，按顺序执行。
 * 在 app.whenReady() 中、ensureDefaultProviders 之前调用。
 */
export function runAllMigrations(deps: ConfigMigrationDeps): void {
  try {
    migrateProviderEnabledToYunyaClaw(deps)
  } catch (err) {
    console.error('[ConfigMigration] 迁移失败:', err)
  }
}
