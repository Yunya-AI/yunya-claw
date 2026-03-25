/**
 * 智能感知配置组件
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Power, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, Settings2, Brain, Target, Search } from 'lucide-react'

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type IntentType = 'greeting' | 'question' | 'command' | 'explanation' | 'error' | 'success' | 'coding'
type SentimentType = 'positive' | 'negative' | 'neutral'

interface PetAction {
  name: string
  frames: string[]
  duration: number
  repeat?: number
  hidden?: boolean
  tags?: string[]
}

interface DecisionRule {
  id: string
  name: string
  description?: string
  triggers: {
    keywords?: string[]
    intent?: IntentType[]
    sentiment?: SentimentType[]
    regex?: string[]
  }
  action: string
  priority: Priority
  cooldown?: number
  enabled?: boolean
}

interface PetIntelligenceConfig {
  enabled: boolean
  sensor: {
    bufferSize: number
    debounceMs: number
  }
  brain: {
    useLLM: boolean
    llmEndpoint?: string
    llmModel?: string
    rules: DecisionRule[]
  }
  executor: {
    maxQueueSize: number
    defaultDuration: number
  }
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-gray-400',
  normal: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
}

export function PetIntelligenceConfig() {
  const [config, setConfig] = useState<PetIntelligenceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<DecisionRule | null>(null)
  const [customActions, setCustomActions] = useState<PetAction[]>([])
  const [testRuleText, setTestRuleText] = useState('')
  const [testRuleResult, setTestRuleResult] = useState<{ matched: boolean; rule?: DecisionRule; message: string } | null>(null)

  // 测试规则匹配（本地模拟 + 触发动作）
  // 测试规则匹配（只匹配，不触发）
  const testRuleMatch = useCallback((text: string) => {
    if (!config || !text.trim()) {
      setTestRuleResult(null)
      return
    }

    const enabledRules = config.brain.rules.filter(r => r.enabled !== false)
    const lowerText = text.toLowerCase()

    // 按优先级排序的匹配结果
    const matchedRules: DecisionRule[] = []

    for (const rule of enabledRules) {
      let matched = false

      // 关键词匹配
      if (rule.triggers.keywords && rule.triggers.keywords.length > 0) {
        for (const keyword of rule.triggers.keywords) {
          if (lowerText.includes(keyword.toLowerCase())) {
            matched = true
            break
          }
        }
      }

      // 正则匹配
      if (!matched && rule.triggers.regex && rule.triggers.regex.length > 0) {
        for (const pattern of rule.triggers.regex) {
          try {
            const regex = new RegExp(pattern, 'gi')
            if (regex.test(text)) {
              matched = true
              break
            }
          } catch (e) {
            // 忽略无效正则
          }
        }
      }

      if (matched) {
        matchedRules.push(rule)
      }
    }

    if (matchedRules.length === 0) {
      setTestRuleResult({
        matched: false,
        message: '未匹配到任何规则',
      })
      return
    }

    // 按优先级排序
    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }
    matchedRules.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])

    const topRule = matchedRules[0]
    setTestRuleResult({
      matched: true,
      rule: topRule,
      message: `匹配规则「${topRule.name}」→ 触发动作「${topRule.action}」`,
    })
  }, [config])

  // 触发匹配的动作
  const triggerMatchedAction = useCallback(async () => {
    if (!testRuleResult?.matched || !testRuleResult.rule) return

    const topRule = testRuleResult.rule
    try {
      await window.electronAPI.petIntelligence.testAction(topRule.action)

      // 计算动作总时长，播放一轮后切回 idle
      const action = customActions.find(a => a.name === topRule.action)
      if (action && action.frames.length > 0) {
        const totalDuration = action.frames.length * action.duration
        setTimeout(async () => {
          // 切回 idle 状态
          const systemActions = await window.electronAPI.desktopPet.getSystemActions()
          if (systemActions.success && systemActions.systemActions) {
            const idleConfig = systemActions.systemActions.find((s: { type: string }) => s.type === 'idle')
            if (idleConfig && idleConfig.actionNames && idleConfig.actionNames.length > 0) {
              const idleAction = idleConfig.actionNames[0]
              await window.electronAPI.petIntelligence.testAction(idleAction)
            }
          }
        }, totalDuration)
      }
    } catch (error) {
      console.error('触发动作失败:', error)
    }
  }, [testRuleResult, customActions])

  // 加载自定义动作列表
  const loadCustomActions = useCallback(async () => {
    try {
      const result = await window.electronAPI.desktopPet.getCustomActions()
      if (result.success) {
        setCustomActions(result.actions || [])
      }
    } catch (error) {
      console.error('加载自定义动作失败:', error)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const result = await window.electronAPI.petIntelligence.getConfig()
      if (result.success) {
        setConfig(result.config)
      }
    } catch (error) {
      console.error('加载智能感知配置失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
    loadCustomActions()
  }, [loadConfig, loadCustomActions])

  const saveConfig = async (newConfig: PetIntelligenceConfig) => {
    setSaving(true)
    try {
      await window.electronAPI.petIntelligence.saveConfig(newConfig)
      setConfig(newConfig)
    } catch (error) {
      console.error('保存智能感知配置失败:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (enabled: boolean) => {
    try {
      const result = await window.electronAPI.petIntelligence.toggle(enabled)
      if (result.success) {
        setConfig(prev => prev ? { ...prev, enabled: result.enabled } : null)
      }
    } catch (error) {
      console.error('切换智能感知状态失败:', error)
    }
  }

  const updateRule = (ruleId: string, updates: Partial<DecisionRule>) => {
    if (!config) return
    const newRules = config.brain.rules.map(rule =>
      rule.id === ruleId ? { ...rule, ...updates } : rule
    )
    saveConfig({ ...config, brain: { ...config.brain, rules: newRules } })
  }

  const deleteRule = (ruleId: string) => {
    if (!config) return
    const newRules = config.brain.rules.filter(rule => rule.id !== ruleId)
    saveConfig({ ...config, brain: { ...config.brain, rules: newRules } })
  }

  const addRule = () => {
    if (!config) return
    const newRule: DecisionRule = {
      id: `rule-${Date.now()}`,
      name: '新规则',
      triggers: { keywords: [] },
      action: 'idle',
      priority: 'normal',
      enabled: true,
    }
    saveConfig({
      ...config,
      brain: { ...config.brain, rules: [...config.brain.rules, newRule] },
    })
    setExpandedRuleId(newRule.id)
    setEditingRule(newRule)
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-24" />
        <div className="h-4 bg-muted rounded w-48" />
      </div>
    )
  }

  if (!config) {
    return <div className="text-center py-4 text-muted-foreground text-sm">无法加载配置</div>
  }

  return (
    <div className="space-y-4">
      {/* 标题和描述 */}
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">智能感知</span>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        让桌宠根据对话内容自动做出反应
      </p>

      {/* 启用开关 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Power className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">启用智能感知</span>
        </div>
        <button
          onClick={() => toggleEnabled(!config.enabled)}
          className={`w-10 h-5 rounded-full transition-colors ${
            config.enabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
              config.enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* 规则列表 */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">动作规则</span>
              </div>
              <button
                onClick={addRule}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-muted hover:bg-muted/80"
              >
                <Plus className="w-3 h-3" />
                添加规则
              </button>
            </div>

            <div className="space-y-2">
              {config.brain.rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  customActions={customActions}
                  expanded={expandedRuleId === rule.id}
                  editing={editingRule?.id === rule.id}
                  onToggleExpand={() => setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)}
                  onToggle={() => updateRule(rule.id, { enabled: !rule.enabled })}
                  onEdit={() => setEditingRule(rule)}
                  onSave={(updates) => {
                    updateRule(rule.id, updates)
                    setEditingRule(null)
                  }}
                  onCancel={() => setEditingRule(null)}
                  onDelete={() => deleteRule(rule.id)}
                />
              ))}
            </div>
          </div>

          {/* 测试规则匹配 */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">测试规则匹配</span>
            </div>
            <p className="text-xs text-muted-foreground">输入文本测试会匹配哪个规则</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入测试文本，如：你好"
                value={testRuleText}
                onChange={(e) => {
                  setTestRuleText(e.target.value)
                  testRuleMatch(e.target.value)
                }}
                className="flex-1 h-8 px-3 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={triggerMatchedAction}
                disabled={!testRuleResult?.matched}
                className="px-4 h-8 text-xs rounded transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                播放
              </button>
            </div>
            {testRuleResult && (
              <div className={`text-xs p-2 rounded ${testRuleResult.matched ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                {testRuleResult.message}
              </div>
            )}
          </div>

          {/* 高级设置 */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">高级设置</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">缓冲区大小</span>
                <input
                  type="number"
                  value={config.sensor.bufferSize}
                  onChange={(e) => saveConfig({
                    ...config,
                    sensor: { ...config.sensor, bufferSize: parseInt(e.target.value) || 10 },
                  })}
                  min={1}
                  max={50}
                  className="w-20 h-7 px-2 text-sm text-right bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">防抖延迟 (ms)</span>
                <input
                  type="number"
                  value={config.sensor.debounceMs}
                  onChange={(e) => saveConfig({
                    ...config,
                    sensor: { ...config.sensor, debounceMs: parseInt(e.target.value) || 200 },
                  })}
                  min={50}
                  max={2000}
                  className="w-20 h-7 px-2 text-sm text-right bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">最大队列长度</span>
                <input
                  type="number"
                  value={config.executor.maxQueueSize}
                  onChange={(e) => saveConfig({
                    ...config,
                    executor: { ...config.executor, maxQueueSize: parseInt(e.target.value) || 5 },
                  })}
                  min={1}
                  max={20}
                  className="w-20 h-7 px-2 text-sm text-right bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {saving && (
        <div className="text-xs text-muted-foreground">保存中...</div>
      )}
    </div>
  )
}

// 规则卡片组件
interface RuleCardProps {
  rule: DecisionRule
  customActions: PetAction[]
  expanded: boolean
  editing: boolean
  onToggleExpand: () => void
  onToggle: () => void
  onEdit: () => void
  onSave: (updates: Partial<DecisionRule>) => void
  onCancel: () => void
  onDelete: () => void
}

function RuleCard({
  rule,
  customActions,
  expanded,
  editing,
  onToggleExpand,
  onToggle,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: RuleCardProps) {
  const [editData, setEditData] = useState(rule)

  useEffect(() => {
    setEditData(rule)
  }, [rule])

  // 获取动作显示名称
  const getActionDisplayName = (actionName: string) => {
    const action = customActions.find(a => a.name === actionName)
    return action ? action.name : actionName
  }

  return (
    <div className={`border border-border rounded-lg overflow-hidden ${!rule.enabled ? 'opacity-50' : ''}`}>
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className={`w-8 h-4 rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-muted'}`}
          >
            <div
              className={`w-3 h-3 rounded-full bg-white shadow transform transition-transform ${
                rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-sm font-medium">{rule.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 text-xs rounded text-white ${PRIORITY_COLORS[rule.priority]}`}>
            {PRIORITY_LABELS[rule.priority]}
          </span>
          <span className="text-xs text-muted-foreground">→ {rule.action}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">规则名称</label>
                  <input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">触发动作</label>
                  <select
                    value={editData.action}
                    onChange={(e) => setEditData({ ...editData, action: e.target.value })}
                    className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                  >
                    {customActions.length === 0 ? (
                      <option value="">暂无自定义动作</option>
                    ) : (
                      customActions.map(action => (
                        <option key={action.name} value={action.name}>{action.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">优先级</label>
                  <select
                    value={editData.priority}
                    onChange={(e) => setEditData({ ...editData, priority: e.target.value as Priority })}
                    className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                  >
                    <option value="low">低</option>
                    <option value="normal">普通</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">冷却时间 (ms)</label>
                  <input
                    type="number"
                    value={editData.cooldown || 0}
                    onChange={(e) => setEditData({ ...editData, cooldown: parseInt(e.target.value) || 0 })}
                    className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">触发关键词（逗号分隔）</label>
                <input
                  value={editData.triggers.keywords?.join(', ') || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    triggers: { ...editData.triggers, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) },
                  })}
                  placeholder="你好, hello, hi"
                  className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">正则表达式（逗号分隔）</label>
                <input
                  value={editData.triggers.regex?.join(', ') || ''}
                  onChange={(e) => setEditData({
                    ...editData,
                    triggers: { ...editData.triggers, regex: e.target.value.split(',').map(k => k.trim()).filter(Boolean) },
                  })}
                  placeholder="```[\s\S]*?```"
                  className="w-full h-8 px-2 text-sm bg-input border border-border rounded outline-none focus:ring-1 focus:ring-primary mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors bg-muted hover:bg-muted/80">
                  <X className="w-3 h-3" /> 取消
                </button>
                <button onClick={() => onSave(editData)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors bg-primary text-primary-foreground hover:bg-primary/90">
                  <Save className="w-3 h-3" /> 保存
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">触发关键词：</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.triggers.keywords?.length ? (
                      rule.triggers.keywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 text-xs bg-muted rounded">{kw}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">无</span>
                    )}
                  </div>
                </div>
                {rule.cooldown && rule.cooldown > 0 && (
                  <div className="text-xs text-muted-foreground">冷却时间：{rule.cooldown}ms</div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors bg-muted hover:bg-muted/80">
                  <Edit2 className="w-3 h-3" /> 编辑
                </button>
                <button onClick={onDelete} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors bg-destructive/10 text-destructive hover:bg-destructive/20">
                  <Trash2 className="w-3 h-3" /> 删除
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
