import { useState, useEffect, useRef, useCallback } from 'react'
import { Move } from 'lucide-react'

interface PetAction {
  name: string
  frames: string[]
  duration: number // 每帧持续时间（毫秒）
  hidden?: boolean
}

export default function DesktopPetPage() {
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [customActions, setCustomActions] = useState<PetAction[]>([])
  const [useCustom, setUseCustom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasDraggedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const lastDragPosRef = useRef({ x: 0, y: 0 })

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // 加载主配置
        const configRes = await window.electronAPI?.desktopPet?.getConfig()
        if (configRes?.success && configRes.config?.useCustomActions) {
          setUseCustom(true)
          // 加载自定义动作
          const actionsRes = await window.electronAPI?.desktopPet?.getCustomActions()
          if (actionsRes?.success && actionsRes.actions?.length > 0) {
            setCustomActions(actionsRes.actions)
          }
        }
      } catch (err) {
        console.error('加载桌宠配置失败:', err)
      }
    }
    loadConfig()

    // 监听动作更新事件
    const unsubscribe = window.electronAPI?.desktopPet?.onActionsUpdated?.((data) => {
      console.log('[DesktopPetPage] 收到动作更新事件:', data)
      if (data.actions && data.actions.length > 0) {
        setCustomActions(data.actions)
        setUseCustom(data.useCustomActions)
        // 切换到第一个新动作
        setCurrentAction(data.actions[0].name)
        setFrameIndex(0)
        console.log('[DesktopPetPage] 已更新为', data.actions.length, '个自定义动作')
      }
    })

    // 监听在桌宠窗口播放指定动作的事件
    const unsubscribePlayAction = window.electronAPI?.desktopPet?.onPlayAction?.((action) => {
      console.log('[DesktopPetPage] 收到播放动作事件:', action.name)
      // 添加到自定义动作列表（如果不存在）
      setCustomActions(prev => {
        const exists = prev.find(a => a.name === action.name)
        if (!exists) {
          return [...prev, action]
        }
        return prev
      })
      setUseCustom(true)
      setCurrentAction(action.name)
      setFrameIndex(0)
    })

    return () => {
      unsubscribe?.()
      unsubscribePlayAction?.()
    }
  }, [])

  // 获取当前使用的动作列表（过滤掉隐藏的动作）
  const allActions = (useCustom && customActions.length > 0) ? customActions : []
  const actions = allActions.filter(a => !a.hidden)

  // 获取当前动作
  const getCurrentAction = useCallback((): PetAction | undefined => {
    return actions.find(a => a.name === currentAction) || actions[0]
  }, [actions, currentAction])

  // 帧动画
  useEffect(() => {
    const action = getCurrentAction()
    if (!action) return
    const timer = setInterval(() => {
      if (!isDragging) {
        setFrameIndex(prev => (prev + 1) % action.frames.length)
      }
    }, action.duration)
    return () => clearInterval(timer)
  }, [getCurrentAction, isDragging])

  // 随机切换动作
  useEffect(() => {
    if (actions.length === 0) return
    const timer = setInterval(() => {
      if (!isDragging && Math.random() > 0.95) {
        const randomAction = actions[Math.floor(Math.random() * actions.length)]
        setCurrentAction(randomAction.name)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [actions, isDragging])

  // 点击交互（仅在没有拖拽时触发）
  const handleClick = () => {
    if (actions.length === 0) return
    if (!hasDraggedRef.current) {
      const randomAction = actions[Math.floor(Math.random() * actions.length)]
      setCurrentAction(randomAction.name)
    }
  }

  // 右键菜单
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (window.electronAPI?.desktopPet?.showContextMenu) {
      await window.electronAPI.desktopPet.showContextMenu()
    }
  }

  // 拖拽
  const handleMouseDown = async (e: React.MouseEvent) => {
    hasDraggedRef.current = false
    isDraggingRef.current = true
    lastDragPosRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(true)
    await window.electronAPI?.desktopPet?.startDrag()
  }

  const handleMouseMove = async (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    // 只在鼠标移动超过阈值时才触发拖拽，避免频繁 IPC 调用
    const dx = Math.abs(e.clientX - lastDragPosRef.current.x)
    const dy = Math.abs(e.clientY - lastDragPosRef.current.y)
    if (dx < 2 && dy < 2) return
    lastDragPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = true
    await window.electronAPI?.desktopPet?.drag()
  }

  const handleMouseUp = async () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    await window.electronAPI?.desktopPet?.endDrag()
  }

  const currentActionData = getCurrentAction()
  const currentFrame = currentActionData?.frames[frameIndex % (currentActionData?.frames.length || 1)]

  // 如果没有动作，显示空状态
  if (actions.length === 0 || !currentActionData) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center select-none cursor-grab"
        style={{ background: 'transparent' }}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <span className="text-4xl opacity-30">🐾</span>
      </div>
    )
  }

  // 判断是否是图片URL
  const isImageUrl = (frame: string): boolean => {
    return frame.startsWith('data:image') || frame.startsWith('http') || frame.startsWith('file:')
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
      style={{
        background: 'transparent',
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="transition-transform duration-200"
        style={{
          width: '80%',
          height: '80%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isDragging ? 'none' : undefined,
        }}
      >
        {isImageUrl(currentFrame) ? (
          <img
            src={currentFrame}
            alt="pet"
            className="w-full h-full object-contain drop-shadow-lg"
            draggable={false}
          />
        ) : (
          <span
            className="text-6xl drop-shadow-lg animate-bounce"
            style={{ animationDuration: currentActionData.duration + 'ms' }}
          >
            {currentFrame}
          </span>
        )}
      </div>

      {/* 拖拽提示 */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Move className="w-4 h-4 text-white/50" />
        </div>
      )}
    </div>
  )
}
