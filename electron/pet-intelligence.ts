/**
 * 桌宠智能感知系统 - 类型定义和统一入口
 *
 * 架构：流式内容感知器 → 动作决策中心 → 动作执行器
 */

import type { BrowserWindow } from 'electron'

// ============ 类型定义 ============

/** 感知事件类型 */
export type SensorEventType = 'text' | 'intent' | 'emotion' | 'milestone'

/** 意图类型 */
export type IntentType = 'greeting' | 'question' | 'command' | 'explanation' | 'error' | 'success' | 'coding'

/** 情感类型 */
export type SentimentType = 'positive' | 'negative' | 'neutral'

/** 优先级 */
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

/** Agent 状态 */
export type AgentState = 'idle' | 'thinking' | 'responding' | 'error'

/** 感知事件 */
export interface SensorEvent {
  type: SensorEventType
  content: string
  metadata?: {
    keywords?: string[]
    intent?: IntentType
    sentiment?: SentimentType
    confidence?: number
    isCodeBlock?: boolean
  }
  timestamp: number
}

/** 决策规则 */
export interface DecisionRule {
  id: string
  name: string
  description?: string
  triggers: {
    keywords?: string[]
    intent?: IntentType[]
    sentiment?: SentimentType[]
    regex?: string[]
    agentState?: AgentState[]
  }
  action: string
  priority: Priority
  cooldown?: number // 冷却时间（毫秒）
  enabled?: boolean
}

/** 动作决策 */
export interface ActionDecision {
  actionName: string
  priority: Priority
  interruptible: boolean
  reason: string
  ruleId?: string
  parameters?: Record<string, unknown>
}

/** 传感器配置 */
export interface SensorConfig {
  bufferSize: number // 内容缓冲区大小
  debounceMs: number // 防抖延迟（毫秒）
}

/** 决策中心配置 */
export interface BrainConfig {
  useLLM: boolean
  llmEndpoint?: string
  llmModel?: string
  rules: DecisionRule[]
}

/** 执行器配置 */
export interface ExecutorConfig {
  maxQueueSize: number // 最大队列长度
  defaultDuration: number // 默认动作持续时间
}

/** 智能感知系统配置 */
export interface PetIntelligenceConfig {
  enabled: boolean
  sensor: SensorConfig
  brain: BrainConfig
  executor: ExecutorConfig
}

// ============ 默认配置 ============

export const DEFAULT_SENSOR_CONFIG: SensorConfig = {
  bufferSize: 10,
  debounceMs: 200,
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxQueueSize: 5,
  defaultDuration: 2000,
}

/** 默认决策规则 */
export const DEFAULT_RULES: DecisionRule[] = [
  {
    id: 'greeting-hello',
    name: '问候回应',
    description: '检测到问候语时挥手',
    triggers: {
      keywords: ['你好', 'hello', 'hi', '嗨', '您好', '哈喽', 'hey'],
    },
    action: 'wave',
    priority: 'high',
    cooldown: 5000,
    enabled: true,
  },
  {
    id: 'greeting-goodbye',
    name: '告别回应',
    description: '检测到告别语时挥手',
    triggers: {
      keywords: ['再见', 'bye', '拜拜', '下次见', 'goodbye'],
    },
    action: 'wave',
    priority: 'high',
    cooldown: 5000,
    enabled: true,
  },
  {
    id: 'thinking',
    name: '思考状态',
    description: '检测到问题时思考',
    triggers: {
      intent: ['question'],
    },
    action: 'think',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'success',
    name: '成功庆祝',
    description: '检测到成功时庆祝',
    triggers: {
      keywords: ['完成', '成功', 'done', '搞定', '解决', '成功'],
      intent: ['success'],
    },
    action: 'celebrate',
    priority: 'high',
    cooldown: 3000,
    enabled: true,
  },
  {
    id: 'error',
    name: '错误响应',
    description: '检测到错误时难过',
    triggers: {
      keywords: ['错误', '失败', 'error', '抱歉', '对不起', '无法', '不能'],
      intent: ['error'],
    },
    action: 'sad',
    priority: 'high',
    cooldown: 3000,
    enabled: true,
  },
  {
    id: 'coding',
    name: '编程模式',
    description: '输出代码时打字动作',
    triggers: {
      regex: ['```[\\s\\S]*?```'],
    },
    action: 'typing',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'explaining',
    name: '解释说明',
    description: '解释内容时',
    triggers: {
      intent: ['explanation'],
    },
    action: 'explain',
    priority: 'low',
    enabled: true,
  },
  {
    id: 'thanks',
    name: '感谢回应',
    description: '检测到感谢时开心',
    triggers: {
      keywords: ['谢谢', '感谢', 'thanks', 'thank', '多谢'],
    },
    action: 'happy',
    priority: 'high',
    cooldown: 3000,
    enabled: true,
  },
]

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  useLLM: false,
  rules: DEFAULT_RULES,
}

export const DEFAULT_INTELLIGENCE_CONFIG: PetIntelligenceConfig = {
  enabled: false,
  sensor: DEFAULT_SENSOR_CONFIG,
  brain: DEFAULT_BRAIN_CONFIG,
  executor: DEFAULT_EXECUTOR_CONFIG,
}

// ============ 模块导出 ============

export { PetSensor } from './pet-sensor'
export { PetBrain } from './pet-brain'
export { PetExecutor } from './pet-executor'
