/**
 * 动作执行器 (PetExecutor)
 *
 * 功能：
 * - 动作队列管理
 * - 优先级队列
 * - 可打断性检测
 * - 执行状态追踪
 * - 与桌宠窗口通信
 */

import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'
import type { ActionDecision, ExecutorConfig, Priority } from './pet-intelligence'

interface QueuedAction extends ActionDecision {
  id: string
  queuedAt: number
}

export class PetExecutor extends EventEmitter {
  private config: ExecutorConfig
  private actionQueue: QueuedAction[] = []
  private currentAction: QueuedAction | null = null
  private petWindow: BrowserWindow | null = null
  private isExecuting = false
  private actionCounter = 0

  constructor(config: ExecutorConfig) {
    super()
    this.config = config
  }

  /** 设置桌宠窗口 */
  setPetWindow(window: BrowserWindow | null): void {
    this.petWindow = window
  }

  /** 更新配置 */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 添加动作到队列 */
  enqueue(decision: ActionDecision): boolean {
    // 检查队列是否已满
    if (this.actionQueue.length >= this.config.maxQueueSize) {
      // 如果是高优先级，移除最低优先级的动作
      if (decision.priority === 'urgent' || decision.priority === 'high') {
        this.removeLowestPriorityAction()
      } else {
        console.warn('[PetExecutor] 队列已满，忽略动作:', decision.actionName)
        return false
      }
    }

    const queuedAction: QueuedAction = {
      ...decision,
      id: `action-${++this.actionCounter}`,
      queuedAt: Date.now(),
    }

    // 根据优先级插入队列
    this.insertByPriority(queuedAction)

    this.emit('enqueued', queuedAction)

    // 触发队列处理
    this.processQueue()

    return true
  }

  /** 按优先级插入队列 */
  private insertByPriority(action: QueuedAction): void {
    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }

    const actionPriority = priorityOrder[action.priority]

    // 找到合适的插入位置
    let insertIndex = this.actionQueue.length
    for (let i = 0; i < this.actionQueue.length; i++) {
      const queuePriority = priorityOrder[this.actionQueue[i].priority]
      if (actionPriority > queuePriority) {
        insertIndex = i
        break
      }
    }

    this.actionQueue.splice(insertIndex, 0, action)
  }

  /** 移除最低优先级的动作 */
  private removeLowestPriorityAction(): void {
    if (this.actionQueue.length === 0) return

    // 找到最低优先级
    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }

    let lowestIndex = 0
    let lowestPriority = priorityOrder[this.actionQueue[0].priority]

    for (let i = 1; i < this.actionQueue.length; i++) {
      const priority = priorityOrder[this.actionQueue[i].priority]
      if (priority < lowestPriority) {
        lowestPriority = priority
        lowestIndex = i
      }
    }

    const removed = this.actionQueue.splice(lowestIndex, 1)[0]
    this.emit('dropped', removed)
  }

  /** 处理队列 */
  private async processQueue(): Promise<void> {
    if (this.isExecuting) return
    if (this.actionQueue.length === 0) return

    const nextAction = this.actionQueue.shift()!
    await this.executeAction(nextAction)
  }

  /** 执行动作 */
  private async executeAction(action: QueuedAction): Promise<void> {
    if (!this.petWindow || this.petWindow.isDestroyed()) {
      console.warn('[PetExecutor] 桌宠窗口不可用')
      this.isExecuting = false
      this.processQueue()
      return
    }

    this.isExecuting = true
    this.currentAction = action

    this.emit('executing', action)

    try {
      // 发送动作到桌宠窗口
      this.petWindow.webContents.send('pet:executeAction', {
        actionName: action.actionName,
        reason: action.reason,
        priority: action.priority,
        parameters: action.parameters,
      })

      // 同时调用现有的 playAction IPC（兼容性）
      // 注意：这个动作由渲染进程处理
    } catch (error) {
      console.error('[PetExecutor] 执行动作失败:', error)
      this.emit('error', { action, error })
    }

    // 执行完成
    this.currentAction = null
    this.isExecuting = false
    this.emit('completed', action)

    // 继续处理队列
    this.processQueue()
  }

  /** 检查是否可以打断当前动作 */
  canInterrupt(newAction: ActionDecision): boolean {
    if (!this.currentAction) return true
    if (!this.currentAction.interruptible) return false

    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    }

    return priorityOrder[newAction.priority] > priorityOrder[this.currentAction.priority]
  }

  /** 打断当前动作 */
  interrupt(): void {
    if (this.currentAction) {
      this.emit('interrupted', this.currentAction)
      this.currentAction = null
      this.isExecuting = false
    }
  }

  /** 清空队列 */
  clearQueue(): void {
    this.actionQueue = []
    this.emit('cleared')
  }

  /** 获取队列长度 */
  getQueueLength(): number {
    return this.actionQueue.length
  }

  /** 获取当前执行的动作 */
  getCurrentAction(): QueuedAction | null {
    return this.currentAction
  }

  /** 是否正在执行 */
  getIsExecuting(): boolean {
    return this.isExecuting
  }

  /** 销毁 */
  destroy(): void {
    this.clearQueue()
    this.currentAction = null
    this.petWindow = null
    this.removeAllListeners()
  }
}
