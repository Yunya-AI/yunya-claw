import { useState, useEffect, useRef, useCallback } from 'react'

/** 动作定义 */
export interface PetAction {
  name: string
  frames: string[]
  duration: number // 每帧持续时间（毫秒）
  hidden?: boolean
  tags?: string[] // 动作标签，用于状态匹配
}

/** Agent 状态类型 */
export type AgentState = 'idle' | 'thinking' | 'responding' | 'error'

/** 系统动作配置 */
export interface SystemActionConfig {
  type: AgentState
  label: string
  description: string
  actionNames: string[]
}

/** 状态到动作标签的映射（作为后备方案） */
const STATE_ACTION_TAGS: Record<AgentState, string[]> = {
  idle: ['idle', 'stand', 'default'],
  thinking: ['thinking', 'think', 'ponder'],
  responding: ['responding', 'talk', 'speak', 'wave'],
  error: ['error', 'confused', 'sad'],
}

/** 播放器状态 */
export interface PetPlayerState {
  /** 当前动作名称 */
  currentActionName: string | null
  /** 当前帧索引 */
  frameIndex: number
  /** 所有可用动作（过滤隐藏后） */
  actions: PetAction[]
  /** Agent 当前状态 */
  agentState: AgentState
  /** 是否已加载完成 */
  isLoaded: boolean
}

/** 播放器控制方法 */
export interface PetPlayerControls {
  /** 获取当前动作数据 */
  getCurrentAction: () => PetAction | undefined
  /** 获取当前帧内容 */
  getCurrentFrame: () => string | undefined
  /** 手动切换到指定动作 */
  playAction: (actionName: string) => void
  /** 随机切换动作 */
  playRandomAction: () => void
  /** 判断当前是否为 idle 状态 */
  isCurrentActionIdle: () => boolean
}

/** Hook 返回值 */
export interface UseDesktopPetPlayerResult extends PetPlayerState, PetPlayerControls {}

/**
 * 桌宠播放系统 Hook
 * 封装动作管理、帧动画、Agent 状态联动、动作切换队列等逻辑
 */
export function useDesktopPetPlayer(): UseDesktopPetPlayerResult {
  const [currentActionName, setCurrentActionName] = useState<string | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [customActions, setCustomActions] = useState<PetAction[]>([])
  const [systemActionConfigs, setSystemActionConfigs] = useState<SystemActionConfig[]>([])
  const [useCustom, setUseCustom] = useState(false)
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [isLoaded, setIsLoaded] = useState(false)

  // 动作切换队列相关
  const pendingActionRef = useRef<string | null>(null)
  const actionStartTimeRef = useRef<number>(0)
  const actionCompletionTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 获取所有可用动作（过滤隐藏）
  const actions = (useCustom && customActions.length > 0)
    ? customActions.filter(a => !a.hidden)
    : []

  // 获取当前动作数据
  const getCurrentAction = useCallback((): PetAction | undefined => {
    return actions.find(a => a.name === currentActionName) || actions[0]
  }, [actions, currentActionName])

  // 判断当前动作是否为 idle
  const isCurrentActionIdle = useCallback((): boolean => {
    const actionData = getCurrentAction()
    if (!actionData) return true

    const idleConfig = systemActionConfigs.find(c => c.type === 'idle')
    if (idleConfig && idleConfig.actionNames.length > 0) {
      return idleConfig.actionNames.includes(currentActionName || '')
    }

    const actionName = (currentActionName || '').toLowerCase()
    return actionName.includes('idle') || actionName.includes('stand') || actionName.includes('default')
  }, [getCurrentAction, systemActionConfigs, currentActionName])

  // 清除动作完成定时器
  const clearActionTimer = useCallback(() => {
    if (actionCompletionTimerRef.current) {
      clearTimeout(actionCompletionTimerRef.current)
      actionCompletionTimerRef.current = null
    }
  }, [])

  // 统一的动作切换方法
  const switchToAction = useCallback((actionName: string) => {
    console.log('[PetPlayer] 切换到动作:', actionName)
    clearActionTimer()
    pendingActionRef.current = null
    setCurrentActionName(actionName)
    setFrameIndex(0)
    actionStartTimeRef.current = Date.now()
  }, [clearActionTimer])

  // 手动播放指定动作
  const playAction = useCallback((actionName: string) => {
    switchToAction(actionName)
  }, [switchToAction])

  // 随机切换动作
  const playRandomAction = useCallback(() => {
    if (actions.length === 0) return
    const randomAction = actions[Math.floor(Math.random() * actions.length)]
    switchToAction(randomAction.name)
  }, [actions, switchToAction])

  // 获取当前帧
  const getCurrentFrame = useCallback((): string | undefined => {
    const action = getCurrentAction()
    if (!action) return undefined
    return action.frames[frameIndex % action.frames.length]
  }, [getCurrentAction, frameIndex])

  // 根据 Agent 状态选择合适的动作
  const selectActionByState = useCallback((
    state: AgentState,
    actionList: PetAction[],
    configs: SystemActionConfig[]
  ): PetAction | undefined => {
    if (actionList.length === 0) return undefined

    // 1. 优先使用系统动作配置
    const config = configs.find(c => c.type === state)
    if (config && config.actionNames.length > 0) {
      const available = config.actionNames
        .map(name => actionList.find(a => a.name === name && !a.hidden))
        .filter(Boolean) as PetAction[]

      if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)]
      }
    }

    // 2. 后备方案：通过标签/名称匹配
    const tags = STATE_ACTION_TAGS[state] || []
    for (const tag of tags) {
      const matched = actionList.find(a =>
        !a.hidden && a.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
      )
      if (matched) return matched

      const nameMatched = actionList.find(a =>
        !a.hidden && a.name.toLowerCase().includes(tag.toLowerCase())
      )
      if (nameMatched) return nameMatched
    }

    return actionList.find(a => !a.hidden) || actionList[0]
  }, [])

  // 加载配置
  useEffect(() => {
    let mounted = true

    const loadConfig = async () => {
      try {
        // 并行加载配置（使用 getCustomActionsWithData 获取完整图片数据）
        const [configRes, actionsRes, systemActionsRes] = await Promise.all([
          window.electronAPI?.desktopPet?.getConfig(),
          window.electronAPI?.desktopPet?.getCustomActionsWithData?.() || window.electronAPI?.desktopPet?.getCustomActions(),
          window.electronAPI?.desktopPet?.getSystemActions(),
        ])

        if (!mounted) return

        if (configRes?.success && configRes.config?.useCustomActions) {
          setUseCustom(true)
        }

        if (actionsRes?.success && actionsRes.actions?.length > 0) {
          setCustomActions(actionsRes.actions)
          if (!currentActionName) {
            setCurrentActionName(actionsRes.actions[0].name)
            actionStartTimeRef.current = Date.now()
          }
        }

        if (systemActionsRes?.success && systemActionsRes.systemActions) {
          setSystemActionConfigs(systemActionsRes.systemActions)
        }

        setIsLoaded(true)
      } catch (err) {
        console.error('[PetPlayer] 加载配置失败:', err)
      }
    }

    loadConfig()

    // 监听 Agent 状态变化
    const unsubscribeAgentState = window.electronAPI?.desktopPet?.onAgentState?.((data) => {
      console.log('[PetPlayer] Agent 状态变化:', data.state)
      setAgentState(data.state)
    })

    // 监听系统动作配置更新
    const unsubscribeSystemActions = window.electronAPI?.desktopPet?.onSystemActionsUpdated?.((data) => {
      console.log('[PetPlayer] 系统动作配置更新:', data.systemActions.length, '个')
      setSystemActionConfigs(data.systemActions)
    })

    // 监听动作更新事件
    const unsubscribeActions = window.electronAPI?.desktopPet?.onActionsUpdated?.(async (data) => {
      console.log('[PetPlayer] 动作更新:', data.actions?.length, '个')
      if (data.actions && data.actions.length > 0) {
        setCustomActions(data.actions)
        setUseCustom(data.useCustomActions)

        // 重新加载系统动作配置
        const systemActionsRes = await window.electronAPI?.desktopPet?.getSystemActions()
        if (systemActionsRes?.success && systemActionsRes.systemActions) {
          setSystemActionConfigs(systemActionsRes.systemActions)
        }

        // 切换到第一个动作
        switchToAction(data.actions[0].name)
      }
    })

    // 监听播放指定动作事件
    const unsubscribePlayAction = window.electronAPI?.desktopPet?.onPlayAction?.((action) => {
      console.log('[PetPlayer] 播放动作事件:', action.name)
      setCustomActions(prev => {
        const exists = prev.find(a => a.name === action.name)
        return exists ? prev : [...prev, action]
      })
      setUseCustom(true)
      switchToAction(action.name)
    })

    return () => {
      mounted = false
      unsubscribeAgentState?.()
      unsubscribeSystemActions?.()
      unsubscribeActions?.()
      unsubscribePlayAction?.()
      clearActionTimer()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Agent 状态变化时切换动作（队列逻辑）
  useEffect(() => {
    if (!useCustom || customActions.length === 0 || !currentActionName) return

    const action = selectActionByState(agentState, actions, systemActionConfigs)
    if (!action || action.name === currentActionName) return

    if (isCurrentActionIdle()) {
      // idle → 其他状态：立即切换
      console.log('[PetPlayer] idle → 切换到:', action.name)
      switchToAction(action.name)
    } else {
      // 非 idle 切换：等当前动作播放完
      const currentData = getCurrentAction()
      if (currentData) {
        const totalDuration = currentData.frames.length * currentData.duration
        const elapsed = Date.now() - actionStartTimeRef.current
        const remaining = totalDuration - elapsed

        if (remaining <= 0) {
          switchToAction(action.name)
        } else {
          pendingActionRef.current = action.name
          console.log('[PetPlayer] 等待切换:', action.name, '剩余', remaining, 'ms')

          clearActionTimer()
          actionCompletionTimerRef.current = setTimeout(() => {
            if (pendingActionRef.current) {
              switchToAction(pendingActionRef.current)
            }
          }, remaining)
        }
      }
    }
  }, [agentState, useCustom, customActions, systemActionConfigs, currentActionName, actions])

  // 帧动画
  useEffect(() => {
    const action = getCurrentAction()
    if (!action) return

    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % action.frames.length)
    }, action.duration)

    return () => clearInterval(timer)
  }, [getCurrentAction])

  return {
    // 状态
    currentActionName,
    frameIndex,
    actions,
    agentState,
    isLoaded,
    // 方法
    getCurrentAction,
    getCurrentFrame,
    playAction,
    playRandomAction,
    isCurrentActionIdle,
  }
}
