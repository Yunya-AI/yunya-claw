import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  BrainCircuit,
  Server,
  Save,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import defaultProvidersConfig from '@/config/default-providers.json'

type ApiProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'ollama'

const API_PROTOCOLS: { value: ApiProtocol; label: string }[] = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
  { value: 'ollama', label: 'Ollama' },
]

type ModelInputType = 'text' | 'image' | 'document'

const INPUT_TYPE_LABELS: { value: ModelInputType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'document', label: '文档' },
]

const DEFAULT_CONTEXT_WINDOW = 200000

interface ProviderModel {
  id: string
  name: string
  input?: ModelInputType[]
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
}

interface Provider {
  id: string
  providerKey: string
  name: string
  baseUrl: string
  apiKey: string
  api: ApiProtocol
  enabled: boolean
  models: ProviderModel[]
  isYunya?: boolean
  website?: string
}

interface OpenclawModelDef {
  id: string
  name?: string
  [key: string]: unknown
}

interface OpenclawProviderConfig {
  baseUrl?: string
  apiKey?: string
  api?: string
  models?: OpenclawModelDef[]
  enabled?: boolean
  [key: string]: unknown
}

const DEFAULT_PROVIDER_KEYS = (defaultProvidersConfig as { providerKeys?: string[] }).providerKeys ?? ['bailian', 'deepseek']

function parseProvidersFromConfig(config: Record<string, unknown>): Provider[] {
  const models = config.models as Record<string, unknown> | undefined
  if (!models?.providers) return []

  const cfgProviders = models.providers as Record<string, OpenclawProviderConfig>
  const providers: Provider[] = []
  let idx = 0

  for (const [key, cfg] of Object.entries(cfgProviders)) {
    if (!cfg || typeof cfg !== 'object') continue

    const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey : ''
    const hasApiKey = apiKey.trim().length > 0
    const isDefaultProvider = DEFAULT_PROVIDER_KEYS.includes(key)
    const configEnabled = typeof cfg.enabled === 'boolean' ? cfg.enabled : true
    const enabled = isDefaultProvider && !hasApiKey ? false : configEnabled

    const providerModels: ProviderModel[] = Array.isArray(cfg.models)
      ? cfg.models.map((m) => {
          const raw = typeof m === 'object' && m ? (m as Record<string, unknown>) : {}
          const id = typeof m === 'string' ? m : (raw.id as string) || ''
          const name = typeof m === 'string' ? m : (raw.name as string) || id
          const rawInput = Array.isArray(raw.input) ? raw.input : undefined
          const input = rawInput?.filter((x): x is ModelInputType =>
            x === 'text' || x === 'image' || x === 'document'
          )
          const ctx = typeof raw.contextWindow === 'number' && raw.contextWindow > 0 ? raw.contextWindow : DEFAULT_CONTEXT_WINDOW
          const maxTokens = typeof raw.maxTokens === 'number' && raw.maxTokens > 0 ? raw.maxTokens : undefined
          const reasoning = typeof raw.reasoning === 'boolean' ? raw.reasoning : false
          return {
            id,
            name,
            input: input && input.length > 0 ? input : ['text'],
            contextWindow: ctx,
            maxTokens,
            reasoning,
          }
        })
      : []

    providers.push({
      id: `cfg-${idx++}`,
      providerKey: key,
      name: key === 'yunya' ? 'Yunya' : key.charAt(0).toUpperCase() + key.slice(1),
      baseUrl: cfg.baseUrl || '',
      apiKey,
      api: (cfg.api as ApiProtocol) || 'openai-completions',
      enabled,
      models: providerModels,
      isYunya: key === 'yunya',
      website: typeof cfg.website === 'string' && cfg.website.trim() ? cfg.website.trim() : undefined,
    })
  }

  return providers
}

export default function ModelsPage({ active = true, onSaved }: { active?: boolean; onSaved?: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedModel, setSelectedModel] = useState<{ providerId: string; modelId: string } | null>(null)

  const loadProviders = useCallback(async (isRefresh = false) => {
    if (!window.electronAPI) return
    if (!isRefresh) setLoading(true)
    try {
      const config = await window.electronAPI.config.read()
      const parsed = parseProvidersFromConfig(config)
      setProviders(parsed)

      const agentsSection = (config.agents as Record<string, unknown>) || {}
      const defaults = (agentsSection.defaults as Record<string, unknown>) || {}
      const savedModel = typeof defaults.model === 'string' ? defaults.model : ''
      if (savedModel && savedModel.includes('/')) {
        const [providerKey, modelId] = savedModel.split('/', 2)
        const provider = parsed.find(p => p.providerKey === providerKey)
        if (provider?.models.some(m => m.id === modelId)) {
          setSelectedModel({ providerId: provider.id, modelId })
        }
      }
    } catch (err) {
      console.error('读取配置失败:', err)
    }
    if (!isRefresh) setLoading(false)
  }, [])

  useEffect(() => {
    if (active) loadProviders()
  }, [active, loadProviders])

  const enabledProviders = providers.filter(p => p.enabled)
  const allModels = enabledProviders.flatMap(p =>
    p.models.map(m => ({ providerId: p.id, modelId: m.id, providerName: p.name }))
  )

  useEffect(() => {
    if (allModels.length > 0 && !selectedModel) {
      setSelectedModel({ providerId: allModels[0].providerId, modelId: allModels[0].modelId })
    }
  }, [allModels, selectedModel])

  const saveToConfig = useCallback(async (overrideProviders?: Provider[]): Promise<boolean> => {
    if (!window.electronAPI) return false

    const source = overrideProviders ?? providers
    setSaving(true)
    const data = source.map(p => ({
      providerKey: p.providerKey,
      name: p.name,
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      models: p.models.map(m => ({
        id: m.id,
        input: m.input ?? ['text'],
        contextWindow: m.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
        maxTokens: m.maxTokens,
        reasoning: m.reasoning ?? false,
      })),
      api: p.api,
      website: p.website,
    }))

    const provider = selectedModel ? source.find(p => p.id === selectedModel.providerId) : null
    const selectedModelPayload =
      selectedModel && provider?.providerKey
        ? { providerKey: provider.providerKey, modelId: selectedModel.modelId }
        : undefined

    const result = await window.electronAPI.config.saveProviders(data, selectedModelPayload)
    setSaving(false)
    return result.success
  }, [providers, selectedModel])

  const handleRefresh = useCallback(async () => {
    await loadProviders(true)
  }, [loadProviders])

  const handleSave = useCallback(async () => {
    setSaveMessage(null)
    const ok = await saveToConfig()
    setSaveMessage(ok ? { type: 'success', text: '已保存' } : { type: 'error', text: '保存失败' })
    setTimeout(() => setSaveMessage(null), 3000)
    if (ok) onSaved?.()
  }, [saveToConfig, onSaved])

  const addProvider = () => {
    const newProvider: Provider = {
      id: `new-${Date.now()}`,
      providerKey: '',
      name: '新的 Provider',
      baseUrl: '',
      apiKey: '',
      api: 'openai-completions',
      enabled: true,
      models: [],
    }
    setProviders(prev => [...prev, newProvider])
    setExpandedProvider(newProvider.id)
    setEditingProvider(newProvider.id)
  }

  const removeProvider = (id: string) => {
    setProviders(prev => prev.filter(p => p.id !== id))
    if (selectedModel?.providerId === id) setSelectedModel(null)
  }

  const updateProvider = (id: string, updates: Partial<Provider>) => {
    setProviders(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)))
  }

  const addModelToProvider = (providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (provider && modelId && !provider.models.some(m => m.id === modelId)) {
      updateProvider(providerId, {
        models: [...provider.models, {
          id: modelId,
          name: modelId,
          input: ['text'],
          contextWindow: DEFAULT_CONTEXT_WINDOW,
          maxTokens: undefined,
          reasoning: false,
        }],
      })
    }
  }

  const updateModelConfig = (providerId: string, modelId: string, updates: Partial<Pick<ProviderModel, 'contextWindow' | 'maxTokens' | 'reasoning'>>) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return
    const updatedModels = provider.models.map(m =>
      m.id === modelId ? { ...m, ...updates } : m
    )
    updateProvider(providerId, { models: updatedModels })
  }

  const toggleModelInput = (providerId: string, modelId: string, type: ModelInputType) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return
    const model = provider.models.find(m => m.id === modelId)
    if (!model) return
    const current = model.input ?? ['text']
    const has = current.includes(type)
    let next: ModelInputType[]
    if (has) {
      next = current.filter(t => t !== type)
      if (next.length === 0) next = ['text']
    } else {
      next = [...current, type]
    }
    const updatedModels = provider.models.map(m =>
      m.id === modelId ? { ...m, input: next } : m
    )
    updateProvider(providerId, { models: updatedModels })
    const updatedProvider = { ...provider, models: updatedModels }
    const overrideProviders = providers.map(p =>
      p.id === providerId ? updatedProvider : p
    )
    saveToConfig(overrideProviders)
  }

  const removeModelFromProvider = (providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      updateProvider(providerId, {
        models: provider.models.filter(m => m.id !== modelId),
      })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* 页头 */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              模型
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Provider 配置（openclaw.json）与默认模型</p>
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className={cn('text-xs', saveMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400')}>
                {saveMessage.text}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 h-8 text-xs"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              保存
            </Button>
          </div>
        </div>

        {/* 默认模型选择 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">默认模型</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allModels.map(({ providerId, modelId, providerName }) => (
              <button
                key={`${providerId}-${modelId}`}
                onClick={() => setSelectedModel({ providerId, modelId })}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all cursor-pointer',
                  selectedModel?.providerId === providerId && selectedModel?.modelId === modelId
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary/50 hover:bg-secondary hover:border-border'
                )}
              >
                <div className="flex items-center gap-1.5 w-full">
                  {selectedModel?.providerId === providerId && selectedModel?.modelId === modelId && (
                    <Check className="w-3 h-3 text-primary shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{modelId}</span>
                </div>
                <span className="text-xs text-muted-foreground">{providerName}</span>
              </button>
            ))}
          </div>
          {allModels.length === 0 && (
            <p className="text-sm text-muted-foreground bg-secondary/50 p-4 rounded-lg text-center">
              请先添加 Provider 并配置模型
            </p>
          )}
        </section>

        {/* Provider 管理 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              Provider 管理
              <span className="text-xs text-muted-foreground font-normal">（{providers.length} 个）</span>
            </h2>
            <Button size="sm" variant="outline" onClick={addProvider} className="gap-1.5 h-7 text-xs">
              <Plus className="w-3 h-3" />
              添加
            </Button>
          </div>

          <div className="space-y-2">
            {providers.map(provider => {
              const isExpanded = expandedProvider === provider.id
              const isEditing = editingProvider === provider.id

              return (
                <div key={provider.id} className="border border-border rounded-lg overflow-hidden bg-card/50">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{provider.name}</span>
                        {provider.website && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              window.electronAPI?.util?.openExternal(provider.website!)
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -m-0.5"
                            title="获取API_KEY"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {provider.providerKey || '未设置'}
                        </Badge>
                        {provider.isYunya && (
                          <Badge variant="default" className="text-[10px]">推荐</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">{provider.baseUrl || '未配置'}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">{provider.api}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] text-muted-foreground">{provider.models.length} 模型</span>
                      <Switch
                        checked={provider.enabled}
                        onCheckedChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-4 border-t border-border space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <label className="text-xs font-medium text-muted-foreground">名称</label>
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Input
                                value={provider.name}
                                onChange={e => updateProvider(provider.id, { name: e.target.value })}
                                className="h-8 text-sm"
                              />
                              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingProvider(null)}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{provider.name}</span>
                              <button onClick={() => setEditingProvider(provider.id)} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        {provider.website && (
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.util?.openExternal(provider.website!)}
                            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            获取API_KEY
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Provider Key
                          <span className="text-muted-foreground/60 ml-1">(openclaw.json 中的标识)</span>
                        </label>
                        <Input
                          value={provider.providerKey}
                          onChange={e => updateProvider(provider.id, { providerKey: e.target.value })}
                          placeholder="my-provider"
                          className="h-8 text-sm font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                        <Input
                          value={provider.baseUrl}
                          onChange={e => updateProvider(provider.id, { baseUrl: e.target.value })}
                          placeholder="https://api.example.com/v1"
                          className="h-8 text-sm font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">API 协议</label>
                        <div className="flex flex-wrap gap-1.5">
                          {API_PROTOCOLS.map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => updateProvider(provider.id, { api: value })}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer',
                                provider.api === value
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-secondary text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">API Key</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showApiKeys[provider.id] ? 'text' : 'password'}
                              value={provider.apiKey}
                              onChange={e => updateProvider(provider.id, { apiKey: e.target.value })}
                              placeholder="sk-..."
                              className="h-8 text-sm font-mono pr-9"
                            />
                            <button
                              onClick={() => setShowApiKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showApiKeys[provider.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          模型 <span className="text-muted-foreground/60">（{provider.models.length}）</span>
                        </label>
                        <div className="flex flex-col gap-2">
                          {provider.models.map(model => {
                            const input = model.input ?? ['text']
                            const ctx = model.contextWindow ?? DEFAULT_CONTEXT_WINDOW
                            const maxTokens = model.maxTokens ?? ''
                            const reasoning = model.reasoning ?? false
                            return (
                              <div
                                key={model.id}
                                className="flex flex-col gap-2 p-2 rounded-lg bg-secondary/50 border border-border/50"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs shrink-0">{model.id}</span>
                                  <div className="flex gap-1 shrink-0">
                                    {INPUT_TYPE_LABELS.map(({ value, label }) => (
                                      <button
                                        key={value}
                                        onClick={() => toggleModelInput(provider.id, model.id, value)}
                                        className={cn(
                                          'px-2 py-0.5 rounded text-[10px] transition-colors',
                                          input.includes(value)
                                            ? 'bg-primary/20 text-primary'
                                            : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                        )}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => removeModelFromProvider(provider.id, model.id)}
                                    className="ml-auto text-muted-foreground hover:text-red-400 shrink-0"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[10px]">
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-muted-foreground shrink-0">上下文窗口</label>
                                    <Input
                                      type="number"
                                      min={1000}
                                      step={1000}
                                      value={ctx}
                                      onChange={e => {
                                        const v = parseInt(e.target.value, 10)
                                        if (!isNaN(v) && v >= 1000 && v <= 10000000) {
                                          updateModelConfig(provider.id, model.id, { contextWindow: v })
                                        }
                                      }}
                                      className="h-6 w-20 text-xs font-mono px-1.5 no-spinner"
                                    />
                                    <span className="text-muted-foreground/60">tokens</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-muted-foreground shrink-0">最大输出</label>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1000}
                                      placeholder="默认"
                                      value={maxTokens}
                                      onChange={e => {
                                        const raw = e.target.value.trim()
                                        if (raw === '') {
                                          updateModelConfig(provider.id, model.id, { maxTokens: undefined })
                                          return
                                        }
                                        const v = parseInt(raw, 10)
                                        if (!isNaN(v) && v >= 1 && v <= 1000000) {
                                          updateModelConfig(provider.id, model.id, { maxTokens: v })
                                        }
                                      }}
                                      className="h-6 w-20 text-xs font-mono px-1.5 no-spinner"
                                    />
                                    <span className="text-muted-foreground/60">tokens</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-muted-foreground shrink-0">推理模式</label>
                                    <Switch
                                      checked={reasoning}
                                      onCheckedChange={v => updateModelConfig(provider.id, model.id, { reasoning: v })}
                                      className="scale-75"
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <Input
                            placeholder="输入模型名称，按 Enter 添加..."
                            className="h-7 text-xs font-mono"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const input = e.currentTarget
                                addModelToProvider(provider.id, input.value.trim())
                                input.value = ''
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5 h-7"
                          onClick={() => removeProvider(provider.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                          删除此 Provider
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {providers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                <Server className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无 Provider 配置</p>
                <p className="text-xs mt-1">点击"添加"创建新的 Provider</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
