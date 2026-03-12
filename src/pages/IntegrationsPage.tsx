import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Copy, Check, Loader2, MessageCircle, Send, Bird, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabKey = 'qq' | 'feishu' | 'dingtalk' | 'other'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'qq', label: 'QQ', icon: MessageCircle },
  { key: 'feishu', label: '飞书', icon: Send },
  { key: 'dingtalk', label: '钉钉', icon: Bird },
  { key: 'other', label: '其他', icon: Terminal },
]

function copyToClipboard(text: string): Promise<boolean> {
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
}

type PairingResult = { type: 'success' | 'error'; text: string } | null

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('qq')
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)
  const [pairingResults, setPairingResults] = useState<Record<string, PairingResult>>({})

  const setPairingResult = useCallback((channel: string, result: PairingResult) => {
    setPairingResults(prev => ({ ...prev, [channel]: result }))
  }, [])

  const handleCopy = useCallback(async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedCmd(key)
      setTimeout(() => setCopiedCmd(null), 1500)
    }
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">接入</h1>
        <p className="text-sm text-muted-foreground mt-0.5">配置 QQ、飞书、钉钉等渠道，将智能体接入到群聊与私聊</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧 Tab */}
        <div className="w-44 shrink-0 border-r border-border py-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                activeTab === key
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'qq' && <QQIntegration onCopy={handleCopy} copiedCmd={copiedCmd} pairingResult={pairingResults['qqbot'] ?? null} onPairingResultChange={r => setPairingResult('qqbot', r)} />}
          {activeTab === 'feishu' && <FeishuIntegration onCopy={handleCopy} copiedCmd={copiedCmd} pairingResult={pairingResults['feishu'] ?? null} onPairingResultChange={r => setPairingResult('feishu', r)} />}
          {activeTab === 'dingtalk' && <DingTalkIntegration onCopy={handleCopy} copiedCmd={copiedCmd} pairingResult={pairingResults['dingtalk-connector'] ?? null} onPairingResultChange={r => setPairingResult('dingtalk-connector', r)} />}
          {activeTab === 'other' && <OtherIntegration onCopy={handleCopy} copiedCmd={copiedCmd} />}
        </div>
      </div>
    </div>
  )
}

interface IntegrationProps {
  onCopy: (text: string, key: string) => void
  copiedCmd: string | null
}

interface ChannelWithPairingProps extends IntegrationProps {
  pairingResult: PairingResult
  onPairingResultChange: (v: PairingResult) => void
}

type QQDmPolicy = 'open' | 'pairing' | 'allowlist'
type QQGroupPolicy = 'open' | 'allowlist' | 'disabled'

function QQIntegration({ onCopy, copiedCmd, pairingResult, onPairingResultChange }: ChannelWithPairingProps) {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dmPolicy, setDmPolicy] = useState<QQDmPolicy>('pairing')
  const [groupPolicy, setGroupPolicy] = useState<QQGroupPolicy>('open')
  const [saving, setSaving] = useState(false)
  const [saveStep, setSaveStep] = useState<'installing' | 'configuring' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pairingCode, setPairingCode] = useState('')
  const [pairingSubmitting, setPairingSubmitting] = useState(false)

  const handlePairingApprove = async () => {
    const code = pairingCode.trim()
    if (!code) {
      onPairingResultChange({ type: 'error', text: '请输入配对码' })
      return
    }
    setPairingSubmitting(true)
    onPairingResultChange(null)
    try {
      const res = await window.electronAPI?.integrations.pairingApprove('qqbot', code)
      if (res?.success) {
        onPairingResultChange({ type: 'success', text: '配对已通过，QQ 单聊应可正常使用' })
        setPairingCode('')
      } else {
        onPairingResultChange({ type: 'error', text: res?.error || '配对失败' })
      }
    } catch (err) {
      onPairingResultChange({ type: 'error', text: String(err) })
    } finally {
      setPairingSubmitting(false)
    }
  }

  useEffect(() => {
    if (!window.electronAPI?.config?.read) return
    window.electronAPI.config.read().then((cfg: Record<string, unknown>) => {
      const ch = (cfg.channels as Record<string, unknown>)?.['qqbot'] as Record<string, unknown> | undefined
      if (!ch) return
      const accounts = ch.accounts as Record<string, Record<string, unknown>> | undefined
      const defaultAcc = accounts?.default as Record<string, unknown> | undefined
      const src = defaultAcc ?? ch
      if (src?.appId) setAppId(String(src.appId))
      const secret = src?.appSecret ?? src?.clientSecret ?? ch.appSecret ?? ch.clientSecret
      if (secret) setAppSecret(String(secret))
      setEnabled(ch.enabled !== false)
      const dp = ch.dmPolicy as string | undefined
      if (dp === 'open' || dp === 'pairing' || dp === 'allowlist') setDmPolicy(dp)
      const gp = ch.groupPolicy as string | undefined
      if (gp === 'open' || gp === 'allowlist' || gp === 'disabled') setGroupPolicy(gp)
    }).catch(() => {})
  }, [])

  const token = appId && appSecret ? `${appId}:${appSecret}` : ''

  const handleRunAdd = async () => {
    if (!token) {
      setMessage({ type: 'error', text: '请先填写 AppID 和 AppSecret' })
      return
    }
    setSaving(true)
    setMessage(null)
    setSaveStep('installing')
    try {
      const ensureRes = await window.electronAPI?.integrations.ensurePlugin('qqbot')
      setSaveStep('configuring')
      if (ensureRes && !ensureRes.success) {
        setMessage({ type: 'error', text: ensureRes.error || '插件安装失败' })
        return
      }
      const addRes = await window.electronAPI?.integrations.runChannelsAdd('qqbot', token)
      if (!addRes?.success) {
        setMessage({ type: 'error', text: addRes?.error || '配置失败' })
        return
      }
      const patchPayload: Record<string, unknown> = {
        enabled,
        dmPolicy,
        groupPolicy,
      }
      if (dmPolicy === 'pairing' || dmPolicy === 'allowlist') {
        patchPayload.allowFrom = []
      }
      const patchRes = await window.electronAPI?.integrations.patchChannels('qqbot', patchPayload)
      if (patchRes?.success) {
        const hint = ensureRes?.installed ? 'QQ 插件已安装，渠道已配置，请重启应用使配置生效' : 'QQ 渠道已配置，请重启应用使配置生效'
        setMessage({ type: 'success', text: hint })
      } else {
        setMessage({ type: 'error', text: patchRes?.error || '策略配置保存失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
      setSaveStep(null)
    }
  }

  const saveButtonText = saving
    ? (saveStep === 'installing' ? '安装插件中…' : saveStep === 'configuring' ? '保存配置中…' : '保存中…')
    : '保存配置'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 shrink-0 aspect-square rounded-xl bg-red-500/20 flex items-center justify-center">
          <MessageCircle className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold">QQbot</h2>
          <p className="text-sm text-muted-foreground">
            将 QQ 机器人接入 OpenClaw，支持群聊与私聊。
            <br />
            配置后可在 QQ 群或私聊中与智能体对话。需在 QQ 开放平台创建机器人应用。
          </p>
          <span className="text-xs text-muted-foreground mt-1 block">
            官方地址{' '}
            <button
              type="button"
              onClick={() => window.electronAPI?.util?.openExternal('https://q.qq.com/qqbot/openclaw/index.html')}
              className="text-primary hover:underline"
            >
              https://q.qq.com/qqbot/openclaw/index.html
            </button>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">启用</label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm text-muted-foreground">{enabled ? '已启用' : '已禁用'}</span>
        </div>
        <div>
          <label className="text-sm font-medium">AppID</label>
          <div className="flex gap-2 mt-1">
            <Input
              value={appId}
              onChange={e => setAppId(e.target.value)}
              placeholder="类似 1902391938 的 10 位数字"
              className="font-mono"
            />
            <Button variant="outline" size="icon" onClick={() => onCopy(appId, 'qq-appid')} disabled={!appId}>
              {copiedCmd === 'qq-appid' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">AppSecret</label>
          <div className="flex gap-2 mt-1">
            <Input
              type="password"
              value={appSecret}
              onChange={e => setAppSecret(e.target.value)}
              placeholder="类似 HSUQBsFOJ1TvqeGd 的格式"
              className="font-mono"
            />
            <Button variant="outline" size="icon" onClick={() => onCopy(appSecret, 'qq-secret')} disabled={!appSecret}>
              {copiedCmd === 'qq-secret' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-amber-500/90 mt-1.5">
            出于安全考虑，AppSecret 不支持明文保存，二次查看将会强制重置，请自行妥善保存。
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 min-w-0">
            <label className="text-sm font-medium shrink-0 w-24">私聊策略</label>
            <Select
              value={dmPolicy}
              onChange={v => setDmPolicy(v as QQDmPolicy)}
              options={[
                { value: 'pairing', label: 'pairing（配对）' },
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
              ]}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <label className="text-sm font-medium shrink-0 w-24">群聊策略</label>
            <Select
              value={groupPolicy}
              onChange={v => setGroupPolicy(v as QQGroupPolicy)}
              options={[
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
                { value: 'disabled', label: 'disabled（禁用）' },
              ]}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        填写 AppID 和 AppSecret 后点击保存，将自动安装 QQ 插件（若未安装）并配置渠道。保存后请重启应用使配置生效。
      </p>

      <Button onClick={handleRunAdd} disabled={!token || saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saveButtonText}
      </Button>

      {message && (
        <p className={cn('text-sm', message.type === 'success' ? 'text-green-500' : 'text-red-500')}>
          {message.text}
        </p>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">QQ 单聊配对</p>
        <p className="text-sm text-muted-foreground">
          保存配置后，QQ 单聊首次使用时机器人可能提示「OpenClaw access not configured」并给出配对码。请在下方输入该配对码并提交，以完成配对。
        </p>
        <div className="flex gap-2">
          <Input
            value={pairingCode}
            onChange={e => setPairingCode(e.target.value.toUpperCase())}
            placeholder="输入配对码，如 U62LJKDK"
            className="font-mono max-w-[200px]"
          />
          <Button variant="secondary" onClick={handlePairingApprove} disabled={!pairingCode.trim() || pairingSubmitting}>
            {pairingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            提交配对码
          </Button>
        </div>
        {pairingResult && (
          <p className={cn('text-sm font-medium', pairingResult.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {pairingResult.text}
          </p>
        )}
      </div>
    </div>
  )
}

type DmPolicy = 'open' | 'pairing' | 'allowlist'
type GroupPolicy = 'open' | 'allowlist' | 'disabled'

function FeishuIntegration({ onCopy: _onCopy, copiedCmd: _copiedCmd, pairingResult, onPairingResultChange }: ChannelWithPairingProps) {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>('pairing')
  const [groupPolicy, setGroupPolicy] = useState<GroupPolicy>('open')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pairingCode, setPairingCode] = useState('')
  const [pairingSubmitting, setPairingSubmitting] = useState(false)

  const handleSave = async () => {
    if (!appId || !appSecret) {
      setMessage({ type: 'error', text: '请填写 AppID 和 AppSecret' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const patchPayload: Record<string, unknown> = {
        enabled,
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        domain: 'feishu',
        dmPolicy,
        groupPolicy: groupPolicy || 'open',
      }
      if (dmPolicy === 'pairing' || dmPolicy === 'allowlist') {
        patchPayload.allowFrom = []
      }
      const res = await window.electronAPI?.integrations.patchChannels('feishu', patchPayload)
      if (res?.success) {
        setMessage({ type: 'success', text: '飞书配置已保存，请重启应用使配置生效' })
      } else {
        setMessage({ type: 'error', text: res?.error || '保存失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handlePairingApprove = async () => {
    const code = pairingCode.trim()
    if (!code) {
      onPairingResultChange({ type: 'error', text: '请输入配对码' })
      return
    }
    setPairingSubmitting(true)
    onPairingResultChange(null)
    try {
      const res = await window.electronAPI?.integrations.pairingApprove('feishu', code)
      if (res?.success) {
        onPairingResultChange({ type: 'success', text: '配对已通过，飞书单聊应可正常使用' })
        setPairingCode('')
      } else {
        onPairingResultChange({ type: 'error', text: res?.error || '配对失败' })
      }
    } catch (err) {
      onPairingResultChange({ type: 'error', text: String(err) })
    } finally {
      setPairingSubmitting(false)
    }
  }

  useEffect(() => {
    if (!window.electronAPI?.config?.read) return
    window.electronAPI.config.read().then((cfg: Record<string, unknown>) => {
      const ch = (cfg.channels as Record<string, unknown>)?.['feishu'] as Record<string, unknown> | undefined
      if (ch) {
        if (ch.appId) setAppId(String(ch.appId))
        if (ch.appSecret) setAppSecret(String(ch.appSecret))
        setEnabled(ch.enabled !== false)
        const dp = ch.dmPolicy as string | undefined
        if (dp === 'open' || dp === 'pairing' || dp === 'allowlist') setDmPolicy(dp)
        const gp = ch.groupPolicy as string | undefined
        if (gp === 'open' || gp === 'allowlist' || gp === 'disabled') setGroupPolicy(gp)
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 shrink-0 aspect-square rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Send className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold">飞书</h2>
          <p className="text-sm text-muted-foreground">
            飞书插件已内置，无需额外安装。此处仅配置 OpenClaw 侧。
            <br />
            还需在飞书开放平台创建应用并配置事件回调。
          </p>
          <span className="text-xs text-muted-foreground mt-1 block">
            参考文档{' '}
            <button
              type="button"
              onClick={() => window.electronAPI?.util?.openExternal('https://docs-lincore.wuying.com/zh/docs/guide/openclaw/feishu/')}
              className="text-primary hover:underline"
            >
              https://docs-lincore.wuying.com/zh/docs/guide/openclaw/feishu/
            </button>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">启用</label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm text-muted-foreground">{enabled ? '已启用' : '已禁用'}</span>
        </div>
        <div>
          <label className="text-sm font-medium">AppID</label>
          <Input value={appId} onChange={e => setAppId(e.target.value)} placeholder="类似 cli_a91Xf8e70Yb89bc9 的格式" className="mt-1 font-mono" />
        </div>
        <div>
          <label className="text-sm font-medium">AppSecret</label>
          <Input
            type="password"
            value={appSecret}
            onChange={e => setAppSecret(e.target.value)}
            placeholder="类似 fWj0LQe9X2UXyZaMSxG7Tq2lZfyJT11Qq 的格式"
            className="mt-1 font-mono"
          />
          <p className="text-xs text-amber-500/90 mt-1.5">出于安全考虑，AppSecret 不支持明文保存，请自行妥善保存。</p>
        </div>
        <div>
          <label className="text-sm font-medium">Domain</label>
          <Input value="feishu" disabled className="mt-1 bg-muted/50" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 min-w-0">
            <label className="text-sm font-medium shrink-0 w-24">私聊策略</label>
            <Select
              value={dmPolicy}
              onChange={v => setDmPolicy(v as DmPolicy)}
              options={[
                { value: 'pairing', label: 'pairing（配对）' },
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
              ]}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <label className="text-sm font-medium shrink-0 w-24">群聊策略</label>
            <Select
              value={groupPolicy}
              onChange={v => setGroupPolicy(v as GroupPolicy)}
              options={[
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
                { value: 'disabled', label: 'disabled（禁用）' },
              ]}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? '保存中…' : '保存配置'}
      </Button>

      {message && (
        <p className={cn('text-sm', message.type === 'success' ? 'text-green-500' : 'text-red-500')}>{message.text}</p>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">飞书单聊配对</p>
        <p className="text-sm text-muted-foreground">
          保存配置后，飞书单聊首次使用时机器人可能提示「OpenClaw access not configured」并给出配对码。请在下方输入该配对码并提交，以完成配对。
        </p>
        <div className="flex gap-2">
          <Input
            value={pairingCode}
            onChange={e => setPairingCode(e.target.value.toUpperCase())}
            placeholder="输入配对码，如 U62LJKDK"
            className="font-mono max-w-[200px]"
          />
          <Button variant="secondary" onClick={handlePairingApprove} disabled={!pairingCode.trim() || pairingSubmitting}>
            {pairingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            提交配对码
          </Button>
        </div>
        {pairingResult && (
          <p className={cn('text-sm font-medium', pairingResult.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {pairingResult.text}
          </p>
        )}
      </div>
    </div>
  )
}

function DingTalkIntegration({ onCopy, copiedCmd, pairingResult, onPairingResultChange }: ChannelWithPairingProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>('pairing')
  const [groupPolicy, setGroupPolicy] = useState<GroupPolicy>('open')
  const [saving, setSaving] = useState(false)
  const [saveStep, setSaveStep] = useState<'installing' | 'configuring' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pairingCode, setPairingCode] = useState('')
  const [pairingSubmitting, setPairingSubmitting] = useState(false)

  const handlePairingApprove = async () => {
    const code = pairingCode.trim()
    if (!code) {
      onPairingResultChange({ type: 'error', text: '请输入配对码' })
      return
    }
    setPairingSubmitting(true)
    onPairingResultChange(null)
    try {
      const res = await window.electronAPI?.integrations.pairingApprove('dingtalk-connector', code)
      if (res?.success) {
        onPairingResultChange({ type: 'success', text: '配对已通过，钉钉单聊应可正常使用' })
        setPairingCode('')
      } else {
        onPairingResultChange({ type: 'error', text: res?.error || '配对失败' })
      }
    } catch (err) {
      onPairingResultChange({ type: 'error', text: String(err) })
    } finally {
      setPairingSubmitting(false)
    }
  }

  const handleSave = async () => {
    if (enabled && (!clientId || !clientSecret)) {
      setMessage({ type: 'error', text: '请填写 clientId (AppKey) 和 clientSecret (AppSecret)' })
      return
    }
    setSaving(true)
    setMessage(null)
    setSaveStep('installing')
    try {
      const ensureRes = await window.electronAPI?.integrations.ensurePlugin('dingtalk-connector')
      setSaveStep('configuring')
      if (ensureRes && !ensureRes.success) {
        setMessage({ type: 'error', text: ensureRes.error || '插件安装失败' })
        return
      }
      const patchPayload: Record<string, unknown> = {
        enabled,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        sessionTimeout: 1800000,
        asyncMode: false,
        dmPolicy,
        groupPolicy,
      }
      if (dmPolicy === 'pairing' || dmPolicy === 'allowlist') {
        patchPayload.allowFrom = []
      }
      const res = await window.electronAPI?.integrations.patchChannels('dingtalk-connector', patchPayload)
      if (res?.success) {
        const hint = ensureRes?.installed ? '钉钉插件已安装，配置已保存，请重启应用使配置生效' : '钉钉配置已保存，请重启应用使配置生效'
        setMessage({ type: 'success', text: hint })
      } else {
        setMessage({ type: 'error', text: res?.error || '保存失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
      setSaveStep(null)
    }
  }

  const saveButtonText = saving
    ? (saveStep === 'installing' ? '安装插件中…' : saveStep === 'configuring' ? '保存配置中…' : '保存中…')
    : '保存配置'

  useEffect(() => {
    if (!window.electronAPI?.config?.read) return
    window.electronAPI.config.read().then((cfg: Record<string, unknown>) => {
      const ch = (cfg.channels as Record<string, unknown>)?.['dingtalk-connector'] as Record<string, unknown> | undefined
      if (ch) {
        if (ch.clientId) setClientId(String(ch.clientId))
        if (ch.clientSecret) setClientSecret(String(ch.clientSecret))
        setEnabled(ch.enabled !== false)
        const dp = ch.dmPolicy as string | undefined
        if (dp === 'open' || dp === 'pairing' || dp === 'allowlist') setDmPolicy(dp)
        const gp = ch.groupPolicy as string | undefined
        if (gp === 'open' || gp === 'allowlist' || gp === 'disabled') setGroupPolicy(gp)
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 shrink-0 aspect-square rounded-xl bg-blue-600/20 flex items-center justify-center">
          <Bird className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold">钉钉</h2>
          <p className="text-sm text-muted-foreground">
            钉钉机器人连接器，支持 AI Card 流式响应。保存时自动安装插件（若未安装）。
            <br />
            还需在钉钉开放平台申请机器人并完成权限配置。
          </p>
          <span className="text-xs text-muted-foreground mt-1 block">
            参考文档{' '}
            <button
              type="button"
              onClick={() => window.electronAPI?.util?.openExternal('https://docs-lincore.wuying.com/zh/docs/guide/openclaw/ding-talk/')}
              className="text-primary hover:underline"
            >
              https://docs-lincore.wuying.com/zh/docs/guide/openclaw/ding-talk/
            </button>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">启用</label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm text-muted-foreground">{enabled ? '已启用' : '已禁用'}</span>
        </div>
        <div>
          <label className="text-sm font-medium">clientId（钉钉 AppKey）</label>
          <div className="flex gap-2 mt-1">
            <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="dingxxxxxxxxx" className="font-mono" />
            <Button variant="outline" size="icon" onClick={() => onCopy(clientId, 'dt-clientid')} disabled={!clientId}>
              {copiedCmd === 'dt-clientid' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">clientSecret（钉钉 AppSecret）</label>
          <div className="flex gap-2 mt-1">
            <Input
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder="your_secret_here"
              className="font-mono"
            />
            <Button variant="outline" size="icon" onClick={() => onCopy(clientSecret, 'dt-secret')} disabled={!clientSecret}>
              {copiedCmd === 'dt-secret' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-amber-500/90 mt-1.5">出于安全考虑，clientSecret 不支持明文保存，请自行妥善保存。</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 min-w-0">
            <label className="text-sm font-medium shrink-0 w-24">私聊策略</label>
            <Select
              value={dmPolicy}
              onChange={v => setDmPolicy(v as DmPolicy)}
              options={[
                { value: 'pairing', label: 'pairing（配对）' },
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
              ]}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <label className="text-sm font-medium shrink-0 w-24">群聊策略</label>
            <Select
              value={groupPolicy}
              onChange={v => setGroupPolicy(v as GroupPolicy)}
              options={[
                { value: 'open', label: 'open（开放）' },
                { value: 'allowlist', label: 'allowlist（白名单）' },
                { value: 'disabled', label: 'disabled（禁用）' },
              ]}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saveButtonText}
      </Button>

      {message && (
        <p className={cn('text-sm', message.type === 'success' ? 'text-green-500' : 'text-red-500')}>{message.text}</p>
      )}

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">钉钉单聊配对</p>
        <p className="text-sm text-muted-foreground">
          保存配置后，钉钉单聊首次使用时机器人可能提示「OpenClaw access not configured」并给出配对码。请在下方输入该配对码并提交，以完成配对。
        </p>
        <div className="flex gap-2">
          <Input
            value={pairingCode}
            onChange={e => setPairingCode(e.target.value.toUpperCase())}
            placeholder="输入配对码，如 U62LJKDK"
            className="font-mono max-w-[200px]"
          />
          <Button variant="secondary" onClick={handlePairingApprove} disabled={!pairingCode.trim() || pairingSubmitting}>
            {pairingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            提交配对码
          </Button>
        </div>
        {pairingResult && (
          <p className={cn('text-sm font-medium', pairingResult.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {pairingResult.text}
          </p>
        )}
      </div>
    </div>
  )
}

function OtherIntegration({ onCopy, copiedCmd }: IntegrationProps) {
  const cmds = [
    { label: '列出可用渠道', cmd: 'openclaw channels list' },
    { label: '添加渠道（交互式）', cmd: 'openclaw channels add' },
    { label: '添加 Telegram', cmd: 'openclaw channels add --channel telegram --token <bot-token>' },
    { label: '添加 Discord', cmd: 'openclaw channels add --channel discord --token <bot-token>' },
    { label: '添加 Slack', cmd: 'openclaw channels add --channel slack --token <xoxb-...>' },
    { label: '安装插件', cmd: 'openclaw plugins install <package>' },
    { label: '重启 Gateway', cmd: 'openclaw gateway restart' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Terminal className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">其他接入</h2>
          <p className="text-sm text-muted-foreground">使用 OpenClaw 命令行配置 Telegram、Discord、Slack 等渠道</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">常用命令</h3>
        {cmds.map(({ label, cmd }, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm shrink-0 w-32">{label}</span>
            <code className="flex-1 bg-muted/50 px-2 py-1 rounded text-xs break-all">{cmd}</code>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onCopy(cmd, `other-${i}`)}>
              {copiedCmd === `other-${i}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        在终端中执行上述命令，或运行 <code className="bg-muted px-1 rounded">openclaw channels add</code> 进入交互式向导。
      </p>
    </div>
  )
}
