import React, { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Plus, Minus, Trash2, Image, Play, RefreshCw, Info, ChevronDown, ChevronUp, Wand2, Loader2, MonitorPlay, Eye, EyeOff, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PetAction {
  name: string
  frames: string[]
  duration: number
  repeat?: number
  hidden?: boolean
  tags?: string[]
}

// 系统动作类型
type SystemActionType = 'idle' | 'thinking' | 'responding' | 'error'

// 系统动作配置
interface SystemActionConfig {
  type: SystemActionType
  label: string
  description: string
  actionNames: string[]
}

interface DesktopPetConfigProps {
  onSaved?: () => void
  selectedCharacterImage?: string | null
  onImageCleared?: () => void
}

// 判断是否是图片 URL
const isImageUrl = (frame: string): boolean => {
  return frame.startsWith('data:image') || frame.startsWith('http') || frame.startsWith('file:')
}

// 比例选项
const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
]

// 时长选项
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => ({ value: String(d), label: `${d}s` }))

// 自定义下拉选择组件
function CustomSelect({
  value,
  options,
  onChange,
  disabled,
  className = '',
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value) || options[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full h-6 bg-input border border-border rounded px-2 text-xs flex items-center justify-between hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <span className="flex-1 text-center">{selectedOption.label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full px-2 py-1.5 text-xs text-left transition-colors ${
                value === option.value ? 'bg-primary/20' : 'hover:bg-muted'
              }`}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Memo 化的帧组件
const FrameItem = memo(function FrameItem({
  frame,
  frameIndex,
  onUploadImage,
  onRemoveFrame,
  onUpdateFrame,
}: {
  frame: string
  frameIndex: number
  onUploadImage: () => void
  onRemoveFrame: () => void
  onUpdateFrame: (value: string) => void
}) {
  return (
    <div className="relative group">
      <div
        className="w-12 h-12 rounded border border-border bg-input flex items-center justify-center overflow-hidden"
        style={{ background: isImageUrl(frame) ? 'transparent' : 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px' }}
      >
        {isImageUrl(frame) ? (
          <img src={frame} alt={`frame-${frameIndex}`} className="w-full h-full object-contain" />
        ) : (
          <span className="text-xl">{frame}</span>
        )}
      </div>
      <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onUploadImage}
          className="p-1 rounded bg-primary text-primary-foreground"
          title="上传图片"
        >
          <Image className="w-3 h-3" />
        </button>
        <button
          onClick={onRemoveFrame}
          className="p-1 rounded bg-destructive text-destructive-foreground"
          title="删除帧"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <input
        type="text"
        value={frame}
        onChange={(e) => onUpdateFrame(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        title="点击输入 emoji 或图片 URL"
      />
    </div>
  )
})

// Memo 化的动作卡片组件
const ActionCard = memo(function ActionCard({
  action,
  onPreview,
  onPlay,
  onRemove,
  onToggleHidden,
  onUpdateName,
  onUpdateDuration,
  onAddFrame,
  onRemoveFrame,
  onUpdateFrame,
  onUploadImage,
}: {
  action: PetAction
  onPreview: () => void
  onPlay: () => void
  onRemove: () => void
  onToggleHidden: () => void
  onUpdateName: (name: string) => void
  onUpdateDuration: (duration: number) => void
  onAddFrame: () => void
  onRemoveFrame: (frameIndex: number) => void
  onUpdateFrame: (frameIndex: number, value: string) => void
  onUploadImage: (frameIndex: number) => void
}) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      {/* 动作头部 */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={action.name}
          onChange={(e) => onUpdateName(e.target.value)}
          placeholder="动作名称（如 idle、happy）"
          className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">持续时间</label>
          <input
            type="number"
            value={action.duration}
            onChange={(e) => onUpdateDuration(parseInt(e.target.value) || 500)}
            className="w-20 bg-input border border-border rounded px-2 py-2 text-sm text-center"
            min={100}
            max={30000}
            step={100}
          />
          <span className="text-xs text-muted-foreground">ms</span>
        </div>
        <button
          onClick={onPreview}
          className="p-2 rounded hover:bg-muted transition-colors"
          title="预览"
        >
          <Play className="w-4 h-4" />
        </button>
        <button
          onClick={onPlay}
          className="p-2 rounded hover:bg-primary/20 text-primary transition-colors"
          title="在化身窗口播放"
        >
          <MonitorPlay className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleHidden}
          className={cn(
            "p-2 rounded transition-colors",
            action.hidden ? "bg-muted text-muted-foreground" : "hover:bg-muted"
          )}
          title={action.hidden ? "取消隐藏（在预览列表显示）" : "隐藏（不在预览列表显示）"}
        >
          {action.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded hover:bg-destructive/20 text-destructive transition-colors"
          title="删除动作"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 帧列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">帧（{action.frames.length}）</label>
          <button
            onClick={onAddFrame}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加帧
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {action.frames.map((frame, frameIndex) => (
            <FrameItem
              key={frameIndex}
              frame={frame}
              frameIndex={frameIndex}
              onUploadImage={() => onUploadImage(frameIndex)}
              onRemoveFrame={() => onRemoveFrame(frameIndex)}
              onUpdateFrame={(value) => onUpdateFrame(frameIndex, value)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          点击帧输入 emoji，或点击图片按钮上传图片
        </p>
      </div>
    </div>
  )
})

export default function DesktopPetConfig({ onSaved, selectedCharacterImage, onImageCleared }: DesktopPetConfigProps) {
  const [actions, setActions] = useState<PetAction[]>([])
  const [systemActions, setSystemActions] = useState<SystemActionConfig[]>([])
  const [previewAction, setPreviewAction] = useState<string | null>(null)
  const [previewFrame, setPreviewFrame] = useState(0)
  const [loading, setLoading] = useState(true) // 初始为 true，表示正在加载
  const [saving, setSaving] = useState(false)
  const [expandedSpec, setExpandedSpec] = useState(false)
  const previewRef = useRef<NodeJS.Timeout | null>(null)

  // AI 生成动画相关
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [actionPrompts, setActionPrompts] = useState<Array<{ prompt: string; duration: number }>>([{ prompt: '呼吸', duration: 2 }])
  const [generateProgress, setGenerateProgress] = useState<{ current: number; total: number; currentPrompt: string } | null>(null)
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  // 支持的比例
  const SUPPORTED_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1']

  // 根据图片尺寸计算最接近的比例
  const getClosestAspectRatio = (width: number, height: number): string => {
    const ratio = width / height
    const ratioValues: Record<string, number> = {
      '16:9': 16 / 9,
      '9:16': 9 / 16,
      '4:3': 4 / 3,
      '3:4': 3 / 4,
      '1:1': 1,
    }

    let closestRatio = '1:1'
    let minDiff = Math.abs(ratio - 1)

    for (const [ar, value] of Object.entries(ratioValues)) {
      const diff = Math.abs(ratio - value)
      if (diff < minDiff) {
        minDiff = diff
        closestRatio = ar
      }
    }

    return closestRatio
  }

  // 从 base64 图片获取尺寸
  const getImageDimensions = (dataUrl: string): { width: number; height: number } | null => {
    const img = new Image()
    img.src = dataUrl
    if (img.naturalWidth && img.naturalHeight) {
      return { width: img.naturalWidth, height: img.naturalHeight }
    }
    return null
  }

  // 添加动作描述
  const handleAddPrompt = () => {
    setActionPrompts(prev => [...prev, { prompt: '挥手', duration: 2 }])
  }

  // 删除动作描述
  const handleRemovePrompt = (index: number) => {
    setActionPrompts(prev => prev.filter((_, i) => i !== index))
  }

  // 更新动作描述
  const handleUpdatePrompt = (index: number, field: 'prompt' | 'duration', value: string | number) => {
    setActionPrompts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  // 加载配置
  useEffect(() => {
    loadActions()
  }, [])

  // 当选中形象库中的图片时，设置为源图片
  useEffect(() => {
    if (selectedCharacterImage) {
      setSourceImage(selectedCharacterImage)
      setGenerateError(null)
      // 获取图片尺寸并计算比例
      const img = new window.Image()
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const dimensions = { width: img.naturalWidth, height: img.naturalHeight }
          setImageDimensions(dimensions)
          const ratio = getClosestAspectRatio(dimensions.width, dimensions.height)
          setAspectRatio(ratio)
        }
      }
      img.src = selectedCharacterImage
    }
  }, [selectedCharacterImage])

  const loadActions = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI?.desktopPet?.getCustomActions()
      if (res?.success && res.actions) {
        setActions(res.actions)
      }
      // 加载系统动作配置
      const systemRes = await window.electronAPI?.desktopPet?.getSystemActions()
      if (systemRes?.success && systemRes.systemActions) {
        setSystemActions(systemRes.systemActions)
      }
    } catch (err) {
      console.error('加载自定义动作失败:', err)
    }
    setLoading(false)
  }

  // 预览动画
  useEffect(() => {
    if (previewAction) {
      const action = actions.find(a => a.name === previewAction)
      if (action && action.frames.length > 0) {
        previewRef.current = setInterval(() => {
          setPreviewFrame(prev => (prev + 1) % action.frames.length)
        }, action.duration)
        return () => {
          if (previewRef.current) clearInterval(previewRef.current)
        }
      }
    }
  }, [previewAction, actions])

  const handleAddAction = () => {
    setActions(prev => [...prev, {
      name: `action_${Date.now()}`,
      frames: ['🐱'],
      duration: 500,
    }])
  }

  const handleRemoveAction = (index: number) => {
    setActions(prev => prev.filter((_, i) => i !== index))
    if (previewAction === actions[index]?.name) {
      setPreviewAction(null)
    }
  }

  const handleUpdateAction = (index: number, field: keyof PetAction, value: unknown) => {
    setActions(prev => prev.map((action, i) => {
      if (i === index) {
        return { ...action, [field]: value }
      }
      return action
    }))
  }

  const handleAddFrame = (actionIndex: number) => {
    setActions(prev => prev.map((action, i) => {
      if (i === actionIndex) {
        return { ...action, frames: [...action.frames, '😺'] }
      }
      return action
    }))
  }

  const handleRemoveFrame = (actionIndex: number, frameIndex: number) => {
    setActions(prev => prev.map((action, i) => {
      if (i === actionIndex) {
        return { ...action, frames: action.frames.filter((_, fi) => fi !== frameIndex) }
      }
      return action
    }))
  }

  const handleUpdateFrame = (actionIndex: number, frameIndex: number, value: string) => {
    setActions(prev => prev.map((action, i) => {
      if (i === actionIndex) {
        const newFrames = [...action.frames]
        newFrames[frameIndex] = value
        return { ...action, frames: newFrames }
      }
      return action
    }))
  }

  const handleUploadImage = async (actionIndex: number, frameIndex: number) => {
    try {
      const res = await window.electronAPI?.desktopPet?.uploadImage()
      if (res?.success && res.dataUrl) {
        handleUpdateFrame(actionIndex, frameIndex, res.dataUrl)
      }
    } catch (err) {
      console.error('上传图片失败:', err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 保存自定义动作
      const res = await window.electronAPI?.desktopPet?.saveCustomActions(actions)
      if (res?.success) {
        // 同时保存系统动作配置
        await window.electronAPI?.desktopPet?.saveSystemActions(systemActions)
        onSaved?.()
      }
    } catch (err) {
      console.error('保存失败:', err)
    }
    setSaving(false)
  }

  const handleReset = () => {
    setActions([])
    setPreviewAction(null)
  }

  const currentPreviewAction = actions.find(a => a.name === previewAction)
  const currentPreviewFrame = currentPreviewAction?.frames[previewFrame % (currentPreviewAction?.frames.length || 1)]

  return (
    <div className="space-y-6">
      {/* 规范说明 */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setExpandedSpec(!expandedSpec)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">化身形象规范说明</span>
          </div>
          {expandedSpec ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expandedSpec && (
          <div className="px-4 pb-4 space-y-4 text-sm text-muted-foreground border-t border-border pt-4">
            <div>
              <h4 className="font-medium text-foreground mb-2">动作（Action）定义</h4>
              <p>一个化身可以包含多个动作（如 idle 闲置、happy 开心、sleep 睡觉等），点击化身时会随机切换动作。</p>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">帧（Frame）类型</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Emoji：</strong>直接输入 emoji 字符，如 🐱、😺、😸</li>
                <li><strong>图片：</strong>点击上传按钮选择图片，支持 JPG/PNG/GIF/WebP/SVG 格式</li>
                <li><strong>网络图片：</strong>直接输入图片 URL（需要图片支持跨域访问）</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">帧持续时间（Duration）</h4>
              <p>每一帧的显示时间，单位为毫秒。例如 500 表示每帧显示 0.5 秒。</p>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">帧持续时间（Duration）</h4>
              <p>每一帧的显示时间，单位为毫秒。例如 500 表示每帧显示 0.5 秒。</p>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-2">推荐配置</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>帧数：2-8 帧，太多会导致动画不流畅</li>
                <li>持续时间：300-800ms，太快或太慢都不自然</li>
                <li>图片尺寸：建议 128x128 或 256x256 像素</li>
                <li>图片格式：推荐 PNG（透明背景）或 GIF（动图）</li>
              </ul>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="font-medium text-foreground mb-2">示例配置</h4>
              <pre className="text-xs overflow-x-auto">{JSON.stringify([
                { name: 'idle', frames: ['🐱', '😺'], duration: 500 },
                { name: 'happy', frames: ['😸', '😻'], duration: 300 },
              ], null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      {/* 系统动作配置 */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">系统动作</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          配置 Agent 状态对应的动作。当 Agent 进入某种状态时，化身会播放对应的动作动画。
        </p>

        <div className="space-y-4">
          {systemActions.map((sysAction, sysIndex) => {
            const availableActions = actions.filter(a => !a.hidden)
            const selectedActions = sysAction.actionNames.map(name => actions.find(a => a.name === name)).filter(Boolean)

            return (
              <div key={sysAction.type} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">{sysAction.label}</h4>
                    <p className="text-xs text-muted-foreground">{sysAction.description}</p>
                  </div>
                </div>

                {/* 已选择的动作标签 */}
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {selectedActions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">未配置动作</span>
                  ) : (
                    selectedActions.map(action => action && (
                      <span
                        key={action.name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full"
                      >
                        {action.name}
                        <button
                          onClick={() => {
                            setSystemActions(prev => prev.map((sa, i) => {
                              if (i === sysIndex) {
                                return {
                                  ...sa,
                                  actionNames: sa.actionNames.filter(n => n !== action.name)
                                }
                              }
                              return sa
                            }))
                          }}
                          className="hover:text-red-400 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* 添加动作下拉 */}
                {availableActions.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const actionName = e.target.value
                      if (actionName && !sysAction.actionNames.includes(actionName)) {
                        setSystemActions(prev => prev.map((sa, i) => {
                          if (i === sysIndex) {
                            return {
                              ...sa,
                              actionNames: [...sa.actionNames, actionName]
                            }
                          }
                          return sa
                        }))
                      }
                      e.target.value = ""
                    }}
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs"
                  >
                    <option value="">+ 添加动作到「{sysAction.label}」</option>
                    {availableActions
                      .filter(a => !sysAction.actionNames.includes(a.name))
                      .map(action => (
                        <option key={action.name} value={action.name}>{action.name}</option>
                      ))
                    }
                  </select>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          提示：如果某个状态未配置动作，系统会尝试根据动作名称或标签自动匹配。
        </p>
      </div>

      {/* AI 自动生成动画 */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">AI 自动生成动画</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          上传白底角色形象图片，AI 将自动生成动画。需要配置 AGIYIYA_API_KEY 环境变量。
        </p>

        <div className="space-y-4">
          {/* 源图片预览 */}
          <div className="flex items-start gap-4">
            <div
              className="w-20 h-20 rounded-lg border border-border bg-input flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary transition-colors"
              style={{ background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 16px 16px' }}
              onClick={() => {
                if (!generating) {
                  document.getElementById('pet-source-image-input')?.click()
                }
              }}
            >
              {sourceImage ? (
                <img src={sourceImage} alt="源图片" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground text-center px-2">点击上传<br/>白底图片</span>
              )}
            </div>
            <input
              id="pet-source-image-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  const dataUrl = reader.result as string
                  setSourceImage(dataUrl)
                  setGenerateError(null)
                  // 获取图片尺寸并计算比例
                  const img = new window.Image()
                  img.onload = () => {
                    console.log('[DesktopPetConfig] naturalWidth:', img.naturalWidth, 'naturalHeight:', img.naturalHeight)
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      const dimensions = { width: img.naturalWidth, height: img.naturalHeight }
                      setImageDimensions(dimensions)
                      const ratio = getClosestAspectRatio(dimensions.width, dimensions.height)
                      setAspectRatio(ratio)
                      console.log('[DesktopPetConfig] 图片尺寸:', dimensions, '比例:', ratio)
                    }
                  }
                  img.onerror = () => {
                    console.error('[DesktopPetConfig] 图片加载失败')
                  }
                  img.src = dataUrl
                }
                reader.readAsDataURL(file)
              }}
            />
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">动作描述</label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">比例</span>
                      <CustomSelect
                        value={aspectRatio}
                        options={ASPECT_RATIO_OPTIONS}
                        onChange={setAspectRatio}
                        disabled={generating}
                        className="w-16"
                      />
                    </div>
                    <button
                      onClick={handleAddPrompt}
                      disabled={generating}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      添加动作
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {actionPrompts.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.prompt}
                        onChange={(e) => handleUpdatePrompt(index, 'prompt', e.target.value)}
                        placeholder={`动作 ${index + 1} 描述，如：呼吸、挥手、跳跃`}
                        className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
                        disabled={generating}
                      />
                      <CustomSelect
                        value={String(item.duration)}
                        options={DURATION_OPTIONS}
                        onChange={(v) => handleUpdatePrompt(index, 'duration', parseInt(v))}
                        disabled={generating}
                        className="w-16"
                      />
                      {actionPrompts.length > 1 && (
                        <button
                          onClick={() => handleRemovePrompt(index)}
                          disabled={generating}
                          className="p-2 text-muted-foreground hover:text-red-400 disabled:opacity-50"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!sourceImage) {
                    setGenerateError('请先上传源图片')
                    return
                  }

                  const validPrompts = actionPrompts.filter(p => p.prompt.trim().length > 0)

                  if (validPrompts.length === 0) {
                    setGenerateError('请输入至少一个动作描述')
                    return
                  }

                  setGenerating(true)
                  setGenerateError(null)
                  setGenerateProgress({ current: 0, total: actionPrompts.length, currentPrompt: '' })

                  const newActions: PetAction[] = []

                  try {
                    for (let i = 0; i < actionPrompts.length; i++) {
                      const item = actionPrompts[i]
                      const prompt = item.prompt.trim()
                      if (!prompt) continue

                      setGenerateProgress({ current: i + 1, total: actionPrompts.length, currentPrompt: prompt })

                      const res = await window.electronAPI?.desktopPet?.generateVideo({
                        imageDataUrl: sourceImage,
                        prompt: prompt,
                        duration: item.duration,
                        aspectRatio: aspectRatio,
                      })

                      if (res?.success && res.gifDataUrl) {
                        // 使用完整描述作为动作名称
                        const actionName = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
                        const newAction: PetAction = {
                          name: `${actionName}_${Date.now()}_${i}`,
                          frames: [res.gifDataUrl],
                          duration: item.duration * 1000, // 记录视频播放时长（毫秒）
                        }
                        newActions.push(newAction)
                      } else {
                        throw new Error(`"${prompt}" 生成失败: ${res?.error || '未知错误'}`)
                      }
                    }

                    // 添加所有新生成的动作
                    if (newActions.length > 0) {
                      setActions(prev => [...prev, ...newActions])
                      // 自动选中第一个新动作进行预览
                      setPreviewAction(newActions[0].name)
                      setPreviewFrame(0)
                    }

                    // 清空输入
                    setSourceImage(null)
                    setActionPrompts([{ prompt: '呼吸', duration: 2 }])
                    onImageCleared?.()

                  } catch (err) {
                    setGenerateError(String(err))
                  }

                  setGenerating(false)
                  setGenerateProgress(null)
                }}
                disabled={generating || !sourceImage}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors",
                  generating || !sourceImage
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {generateProgress ? `生成中 (${generateProgress.current}/${generateProgress.total})...` : '生成中...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    开始生成
                  </>
                )}
              </button>
            </div>
          </div>

          {generateError && (
            <p className="text-xs text-red-400">{generateError}</p>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• 每个输入框填写一个动作描述，如：呼吸、挥手、跳跃</p>
            <p>• 右侧选择视频时长（1-10秒）</p>
            <p>• 支持的图片格式：PNG、JPG、WebP（推荐白底背景）</p>
            <p>• 需要在「设置」中配置 <code className="bg-muted px-1 rounded">AGIYIYA_API_KEY</code> 环境变量</p>
            <p>• 背景会自动变为绿色再生成视频，最终输出透明背景 GIF</p>
          </div>
        </div>
      </div>

      {/* 预览区域 */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium mb-3">预览</h3>
        <div className="flex items-center gap-4">
          <div
            className="w-24 h-24 bg-black/20 rounded-lg flex items-center justify-center"
            style={{ background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 16px 16px' }}
          >
            {previewAction && currentPreviewFrame ? (
              isImageUrl(currentPreviewFrame) ? (
                <img src={currentPreviewFrame} alt="preview" className="w-16 h-16 object-contain" />
              ) : (
                <span className="text-4xl">{currentPreviewFrame}</span>
              )
            ) : (
              <span className="text-muted-foreground text-xs">选择动作预览</span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <select
              value={previewAction || ''}
              onChange={(e) => {
                setPreviewAction(e.target.value || null)
                setPreviewFrame(0)
              }}
              className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
            >
              <option value="">选择动作...</option>
              {actions.filter(a => !a.hidden).map((action, i) => (
                <option key={i} value={action.name}>{action.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {currentPreviewAction
                ? `${currentPreviewAction.frames.length} 帧，每帧 ${currentPreviewAction.duration}ms`
                : '请先添加动作'}
            </p>
          </div>
        </div>
      </div>

      {/* 动作列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">自定义动作</h3>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              重置
            </button>
            <button
              onClick={handleAddAction}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" />
              添加动作
            </button>
          </div>
        </div>

        {actions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            暂无自定义动作，点击"添加动作"开始配置
          </div>
        ) : (
          <div className="space-y-4">
            {actions.map((action, actionIndex) => (
              <ActionCard
                key={action.name}
                action={action}
                onPreview={() => {
                  setPreviewAction(action.name)
                  setPreviewFrame(0)
                }}
                onPlay={async () => {
                  const res = await window.electronAPI?.desktopPet?.playAction(action.name)
                  if (!res?.success) {
                    console.error('在化身播放失败:', res?.error)
                  }
                }}
                onRemove={() => handleRemoveAction(actionIndex)}
                onToggleHidden={() => handleUpdateAction(actionIndex, 'hidden', !action.hidden)}
                onUpdateName={(name) => handleUpdateAction(actionIndex, 'name', name)}
                onUpdateDuration={(duration) => handleUpdateAction(actionIndex, 'duration', duration)}
                onAddFrame={() => handleAddFrame(actionIndex)}
                onRemoveFrame={(frameIndex) => handleRemoveFrame(actionIndex, frameIndex)}
                onUpdateFrame={(frameIndex, value) => handleUpdateFrame(actionIndex, frameIndex, value)}
                onUploadImage={(frameIndex) => handleUploadImage(actionIndex, frameIndex)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end gap-2">
        <button
          onClick={loadActions}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {loading ? '加载中...' : '取消修改'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || actions.length === 0}
          className={cn(
            "px-4 py-2 text-sm rounded-lg transition-colors",
            actions.length === 0
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 加载指示器 - 固定在底部 */}
      {loading && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border py-3 px-6 flex items-center justify-center gap-2 z-50">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">正在加载配置...</span>
        </div>
      )}
    </div>
  )
}
