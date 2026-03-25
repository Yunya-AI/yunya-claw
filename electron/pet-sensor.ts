/**
 * 流式内容感知器 (PetSensor)
 *
 * 功能：
 * - 接收流式内容
 * - 内容缓冲（滑动窗口）
 * - 关键词匹配
 * - 正则表达式匹配
 * - 意图识别
 * - 发射感知事件
 */

import { EventEmitter } from 'events'
import type {
  SensorEvent,
  SensorConfig,
  IntentType,
  SentimentType,
  DecisionRule,
  DEFAULT_SENSOR_CONFIG,
} from './pet-intelligence'

/** 意图识别模式 */
const INTENT_PATTERNS: Record<IntentType, { keywords: string[]; patterns: RegExp[] }> = {
  greeting: {
    keywords: ['你好', 'hello', 'hi', '嗨', '您好', '哈喽'],
    patterns: [/^(hi|hello|hey)[\s!.]*/i],
  },
  question: {
    keywords: ['？', '?', '吗', '什么', '怎么', '如何', '为什么', '哪', 'who', 'what', 'how', 'why', 'where', 'when'],
    patterns: [/^.+\?$/, /^.+\？$/],
  },
  command: {
    keywords: ['请', '帮我', '帮我', '创建', '删除', '修改', '运行', '执行', '写', '生成'],
    patterns: [/^(请|帮我|请帮我)/],
  },
  explanation: {
    keywords: ['解释', '说明', '是指', '意思是', '原因是', '因为', '所以', '首先', '然后', '最后'],
    patterns: [],
  },
  error: {
    keywords: ['错误', '失败', 'error', 'failed', '无法', '不能', '抱歉', '对不起'],
    patterns: [/error[:：]/i, /failed[:：]/i],
  },
  success: {
    keywords: ['完成', '成功', 'done', 'success', '搞定', '解决'],
    patterns: [/successfully/i],
  },
  coding: {
    keywords: ['```', '代码', 'code', 'function', 'const', 'import', 'class'],
    patterns: [/```\w*\n/, /```$/],
  },
}

/** 情感词汇 */
const SENTIMENT_WORDS = {
  positive: ['好', '棒', '优秀', '完美', '喜欢', '开心', '高兴', '谢谢', '感谢', 'good', 'great', 'excellent', 'perfect', 'thanks'],
  negative: ['坏', '差', '错误', '失败', '抱歉', '对不起', '难过', 'bad', 'error', 'failed', 'sorry'],
}

export class PetSensor extends EventEmitter {
  private buffer: string[] = []
  private config: SensorConfig
  private rules: DecisionRule[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private lastContent = ''

  constructor(config: SensorConfig) {
    super()
    this.config = config
  }

  /** 更新规则 */
  updateRules(rules: DecisionRule[]): void {
    this.rules = rules.filter(r => r.enabled !== false)
  }

  /** 更新配置 */
  updateConfig(config: Partial<SensorConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 接收流式内容 */
  onStreamContent(chunk: string): void {
    // 去重
    if (chunk === this.lastContent) return
    this.lastContent = chunk

    // 添加到缓冲区
    this.buffer.push(chunk)
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.shift()
    }

    // 防抖处理
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.analyze(chunk)
    }, this.config.debounceMs)
  }

  /** 分析内容 */
  private analyze(text: string): SensorEvent | null {
    const trimmedText = text.trim()
    if (!trimmedText) return null

    // 1. 检测意图
    const intent = this.detectIntent(trimmedText)

    // 2. 检测情感
    const sentiment = this.detectSentiment(trimmedText)

    // 3. 提取关键词
    const keywords = this.extractKeywords(trimmedText)

    // 4. 检测代码块
    const isCodeBlock = this.detectCodeBlock(trimmedText)

    // 构建事件
    const event: SensorEvent = {
      type: 'text',
      content: trimmedText,
      metadata: {
        keywords,
        intent,
        sentiment,
        confidence: this.calculateConfidence(intent, sentiment, keywords),
        isCodeBlock,
      },
      timestamp: Date.now(),
    }

    // 发射事件
    this.emit('event', event)

    // 如果有明确的意图，发射意图事件
    if (intent && intent !== 'explanation') {
      this.emit('intent', { ...event, type: 'intent' })
    }

    return event
  }

  /** 检测意图 */
  private detectIntent(text: string): IntentType | undefined {
    const lowerText = text.toLowerCase()

    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
      // 检查关键词
      for (const keyword of patterns.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return intentType as IntentType
        }
      }

      // 检查正则
      for (const pattern of patterns.patterns) {
        if (pattern.test(text)) {
          return intentType as IntentType
        }
      }
    }

    return undefined
  }

  /** 检测情感 */
  private detectSentiment(text: string): SentimentType {
    const lowerText = text.toLowerCase()
    let positiveCount = 0
    let negativeCount = 0

    for (const word of SENTIMENT_WORDS.positive) {
      if (lowerText.includes(word.toLowerCase())) {
        positiveCount++
      }
    }

    for (const word of SENTIMENT_WORDS.negative) {
      if (lowerText.includes(word.toLowerCase())) {
        negativeCount++
      }
    }

    if (positiveCount > negativeCount) return 'positive'
    if (negativeCount > positiveCount) return 'negative'
    return 'neutral'
  }

  /** 提取关键词 */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = []

    // 从规则中提取所有关键词
    for (const rule of this.rules) {
      if (rule.triggers.keywords) {
        for (const keyword of rule.triggers.keywords) {
          if (text.toLowerCase().includes(keyword.toLowerCase())) {
            keywords.push(keyword)
          }
        }
      }
    }

    return [...new Set(keywords)] // 去重
  }

  /** 检测代码块 */
  private detectCodeBlock(text: string): boolean {
    return text.includes('```') || /\n\s*(function|const|let|var|import|class|def|async)\s/.test(text)
  }

  /** 计算置信度 */
  private calculateConfidence(
    intent: IntentType | undefined,
    sentiment: SentimentType,
    keywords: string[]
  ): number {
    let confidence = 0.5 // 基础置信度

    if (intent) confidence += 0.2
    if (sentiment !== 'neutral') confidence += 0.1
    if (keywords.length > 0) confidence += Math.min(0.2, keywords.length * 0.05)

    return Math.min(1, confidence)
  }

  /** 获取缓冲区内容 */
  getBufferContent(): string {
    return this.buffer.join('')
  }

  /** 清空缓冲区 */
  clearBuffer(): void {
    this.buffer = []
    this.lastContent = ''
  }

  /** 销毁 */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.removeAllListeners()
  }
}
