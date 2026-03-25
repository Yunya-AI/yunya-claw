/**
 * 动作决策中心 (PetBrain)
 *
 * 功能：
 * - 规则引擎（快速响应）
 * - 规则匹配
 * - 优先级排序
 * - 冷却时间控制
 * - LLM 决策（可选）
 */

import { EventEmitter } from 'events'
import type {
  SensorEvent,
  ActionDecision,
  DecisionRule,
  BrainConfig,
  Priority,
  AgentState,
} from './pet-intelligence'

export class PetBrain extends EventEmitter {
  private config: BrainConfig
  private cooldowns: Map<string, number> = new Map() // ruleId -> lastTriggerTime
  private currentAgentState: AgentState = 'idle'

  constructor(config: BrainConfig) {
    super()
    this.config = config
  }

  /** 更新配置 */
  updateConfig(config: Partial<BrainConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 更新 Agent 状态 */
  updateAgentState(state: AgentState): void {
    this.currentAgentState = state
  }

  /** 处理感知事件 */
  process(event: SensorEvent): ActionDecision | null {
    // 规则引擎决策
    const decision = this.decideByRules(event)
    return decision
  }

  /** 规则引擎决策 */
  private decideByRules(event: SensorEvent): ActionDecision | null {
    const rules = this.config.rules.filter(r => r.enabled !== false)
    const matchedDecisions: ActionDecision[] = []

    for (const rule of rules) {
      // 检查冷却
      if (this.isInCooldown(rule)) {
        continue
      }

      // 检查 Agent 状态匹配
      if (rule.triggers.agentState && rule.triggers.agentState.length > 0) {
        if (!rule.triggers.agentState.includes(this.currentAgentState)) {
          continue
        }
      }

      // 匹配规则
      const matchResult = this.matchRule(rule, event)
      if (matchResult) {
        matchedDecisions.push({
          actionName: rule.action,
          priority: rule.priority,
          interruptible: true,
          reason: `规则匹配: ${rule.name || rule.id}`,
          ruleId: rule.id,
        })
      }
    }

    if (matchedDecisions.length === 0) {
      return null
    }

    // 按优先级排序，选择最高优先级
    matchedDecisions.sort((a, b) => this.comparePriority(b.priority, a.priority))

    const selected = matchedDecisions[0]

    // 更新冷却
    const matchedRule = rules.find(r => r.id === selected.ruleId)
    if (matchedRule && matchedRule.cooldown) {
      this.cooldowns.set(matchedRule.id, Date.now())
    }

    return selected
  }

  /** 匹配单个规则 */
  private matchRule(rule: DecisionRule, event: SensorEvent): boolean {
    const triggers = rule.triggers

    // 1. 关键词匹配
    if (triggers.keywords && triggers.keywords.length > 0) {
      const content = event.content.toLowerCase()
      for (const keyword of triggers.keywords) {
        if (content.includes(keyword.toLowerCase())) {
          return true
        }
      }
    }

    // 2. 意图匹配
    if (triggers.intent && triggers.intent.length > 0) {
      if (event.metadata?.intent && triggers.intent.includes(event.metadata.intent)) {
        return true
      }
    }

    // 3. 情感匹配
    if (triggers.sentiment && triggers.sentiment.length > 0) {
      if (event.metadata?.sentiment && triggers.sentiment.includes(event.metadata.sentiment)) {
        return true
      }
    }

    // 4. 正则表达式匹配
    if (triggers.regex && triggers.regex.length > 0) {
      for (const pattern of triggers.regex) {
        try {
          const regex = new RegExp(pattern, 'gi')
          if (regex.test(event.content)) {
            return true
          }
        } catch (e) {
          console.error(`[PetBrain] 无效的正则表达式: ${pattern}`, e)
        }
      }
    }

    return false
  }

  /** 检查是否在冷却中 */
  private isInCooldown(rule: DecisionRule): boolean {
    if (!rule.cooldown) return false

    const lastTriggerTime = this.cooldowns.get(rule.id)
    if (!lastTriggerTime) return false

    return Date.now() - lastTriggerTime < rule.cooldown
  }

  /** 比较优先级 */
  private comparePriority(a: Priority, b: Priority): number {
    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }
    return priorityOrder[a] - priorityOrder[b]
  }

  /** LLM 决策（可选功能） */
  async decideByLLM(
    context: { recentText: string; event: SensorEvent },
    gatewayPort: number
  ): Promise<ActionDecision | null> {
    if (!this.config.useLLM || !this.config.llmEndpoint) {
      return null
    }

    const availableActions = this.getAvailableActions()

    const prompt = `你是一个桌面宠物的动作决策系统。根据用户的对话内容，选择最合适的动作。

可用的动作列表：
${availableActions.map(a => `- ${a}`).join('\n')}

最近的对话内容：
${context.recentText}

当前事件：
- 内容: ${context.event.content}
- 意图: ${context.event.metadata?.intent || '未知'}
- 情感: ${context.event.metadata?.sentiment || '中性'}

请分析并选择最合适的动作。只需返回动作名称，不要返回其他内容。
如果不需要执行任何动作，返回 "none"。`

    try {
      const response = await fetch(this.config.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.llmModel || 'default',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 20,
          temperature: 0.3,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM 请求失败: ${response.status}`)
      }

      const data = await response.json()
      const actionName = data.choices?.[0]?.message?.content?.trim().toLowerCase()

      if (!actionName || actionName === 'none') {
        return null
      }

      // 验证动作是否有效
      if (!availableActions.includes(actionName)) {
        console.warn(`[PetBrain] LLM 返回了无效的动作: ${actionName}`)
        return null
      }

      return {
        actionName,
        priority: 'normal',
        interruptible: true,
        reason: 'LLM 决策',
      }
    } catch (error) {
      console.error('[PetBrain] LLM 决策失败:', error)
      return null
    }
  }

  /** 获取可用动作列表 */
  private getAvailableActions(): string[] {
    const actions = new Set<string>()
    for (const rule of this.config.rules) {
      actions.add(rule.action)
    }
    return Array.from(actions)
  }

  /** 添加自定义规则 */
  addRule(rule: DecisionRule): void {
    this.config.rules.push(rule)
  }

  /** 移除规则 */
  removeRule(ruleId: string): void {
    this.config.rules = this.config.rules.filter(r => r.id !== ruleId)
  }

  /** 获取所有规则 */
  getRules(): DecisionRule[] {
    return this.config.rules
  }

  /** 清除所有冷却 */
  clearCooldowns(): void {
    this.cooldowns.clear()
  }

  /** 销毁 */
  destroy(): void {
    this.removeAllListeners()
  }
}
