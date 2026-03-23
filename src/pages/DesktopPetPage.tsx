import { useState, useRef } from 'react'
import { Move, PersonStanding } from 'lucide-react'
import { useDesktopPetPlayer } from '@/hooks/useDesktopPetPlayer'

export default function DesktopPetPage() {
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasDraggedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const lastDragPosRef = useRef({ x: 0, y: 0 })

  // 使用播放器 Hook
  const player = useDesktopPetPlayer()
  const {
    actions,
    isLoaded,
    getCurrentAction,
    getCurrentFrame,
    playRandomAction,
  } = player

  const currentActionData = getCurrentAction()
  const currentFrame = getCurrentFrame()

  // 点击交互（仅在没有拖拽时触发）
  const handleClick = () => {
    if (!hasDraggedRef.current) {
      playRandomAction()
    }
  }

  // 右键菜单
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    await window.electronAPI?.desktopPet?.showContextMenu?.()
  }

  // 拖拽
  const handleMouseDown = async (e: React.MouseEvent) => {
    hasDraggedRef.current = false
    isDraggingRef.current = true
    lastDragPosRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(true)
    await window.electronAPI?.desktopPet?.startDrag?.()
  }

  const handleMouseMove = async (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = Math.abs(e.clientX - lastDragPosRef.current.x)
    const dy = Math.abs(e.clientY - lastDragPosRef.current.y)
    if (dx < 2 && dy < 2) return
    lastDragPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = true
    await window.electronAPI?.desktopPet?.drag?.()
  }

  const handleMouseUp = async () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    await window.electronAPI?.desktopPet?.endDrag?.()
  }

  // 判断是否是图片URL
  const isImageUrl = (frame: string): boolean => {
    return frame.startsWith('data:image') || frame.startsWith('http') || frame.startsWith('file:')
  }

  // 加载中状态
  if (!isLoaded || actions.length === 0 || !currentActionData) {
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
        <PersonStanding className="w-12 h-12 opacity-30 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
      style={{ background: 'transparent' }}
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
        {isImageUrl(currentFrame || '') ? (
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
