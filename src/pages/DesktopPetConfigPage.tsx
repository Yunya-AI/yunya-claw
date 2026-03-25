import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { PersonStanding, Power, Settings2, ChevronDown } from 'lucide-react'
import DesktopPetConfig from '@/components/DesktopPetConfig'
import { PetIntelligenceConfig } from '@/components/PetIntelligenceConfig'

interface ChromakeyConfig {
  color: string
  similarity: number
  blend: number
}

// 颜色选项
const COLOR_OPTIONS = [
  { value: '0x00FF00', label: '绿色 (推荐)', color: '#00FF00' },
  { value: '0x0000FF', label: '蓝色', color: '#0000FF' },
  { value: '0xFF0000', label: '红色', color: '#FF0000' },
  { value: '0x000000', label: '黑色', color: '#000000' },
  { value: '0xFFFFFF', label: '白色', color: '#FFFFFF' },
]

// 自定义颜色选择器组件
function ColorSelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedOption = COLOR_OPTIONS.find(o => o.value === value) || COLOR_OPTIONS[0]

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="h-8 bg-input border border-border rounded px-2 text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <div
          className="w-5 h-5 rounded border border-border"
          style={{ backgroundColor: selectedOption.color }}
        />
        <span>{selectedOption.label}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden">
          {COLOR_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full px-2 py-2 text-sm flex items-center gap-2 transition-colors ${
                value === option.value ? 'bg-primary/20' : 'hover:bg-muted'
              }`}
            >
              <div
                className="w-5 h-5 rounded border border-border shrink-0"
                style={{ backgroundColor: option.color }}
              />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 缓存配置，避免重复加载
let cachedConfig: {
  enabled: boolean
  size: number
  chromakey: ChromakeyConfig
} | null = null

export default function DesktopPetConfigPage() {
  const [configLoaded, setConfigLoaded] = useState(!!cachedConfig)
  const [petEnabled, setPetEnabled] = useState(cachedConfig?.enabled ?? false)
  const [petSize, setPetSize] = useState(cachedConfig?.size ?? 128)
  const [chromakey, setChromakey] = useState<ChromakeyConfig>(
    cachedConfig?.chromakey ?? {
      color: '0x00FF00',
      similarity: 0.27,
      blend: 0.1,
    }
  )
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedCharacterImage, setSelectedCharacterImage] = useState<string | null>(null)

  // 使用 useLayoutEffect 同步加载配置，避免闪烁
  useLayoutEffect(() => {
    if (cachedConfig) {
      setConfigLoaded(true)
      return
    }

    // 立即同步读取配置
    loadPetState()
  }, [])

  const loadPetState = async () => {
    try {
      if (!window.electronAPI?.desktopPet?.getConfig) return
      const res = await window.electronAPI.desktopPet.getConfig()
      if (res?.success && res.config) {
        const config = {
          enabled: res.config.enabled,
          size: res.config.size || 128,
          chromakey: {
            color: res.config.chromakeyColor || '0x00FF00',
            similarity: res.config.chromakeySimilarity ?? 0.27,
            blend: res.config.chromakeyBlend ?? 0.1,
          },
        }
        cachedConfig = config
        setPetEnabled(config.enabled)
        setPetSize(config.size)
        setChromakey(config.chromakey)
        setConfigLoaded(true)
      }
    } catch (err) {
      console.error('加载化身状态失败:', err)
      setConfigLoaded(true)
    }
  }

  const handleTogglePet = async (enable: boolean) => {
    try {
      if (!window.electronAPI?.desktopPet?.toggle) return
      const res = await window.electronAPI.desktopPet.toggle(enable)
      if (res?.success) {
        const enabled = res.enabled ?? enable
        setPetEnabled(enabled)
        if (cachedConfig) cachedConfig.enabled = enabled
      }
    } catch (err) {
      console.error('切换化身状态失败:', err)
    }
  }

  const handleSizeChange = async (size: number) => {
    try {
      if (!window.electronAPI?.desktopPet?.setSize) return
      const res = await window.electronAPI.desktopPet.setSize(size)
      setPetSize(size)
      if (cachedConfig) cachedConfig.size = size
    } catch (err) {
      console.error('设置化身大小失败:', err)
    }
  }

  const handleChromakeyChange = async (key: keyof ChromakeyConfig, value: string | number) => {
    const newChromakey = { ...chromakey, [key]: value }
    setChromakey(newChromakey)
    if (cachedConfig) cachedConfig.chromakey = newChromakey

    try {
      if (!window.electronAPI?.desktopPet?.saveChromakeyConfig) return
      await window.electronAPI.desktopPet.saveChromakeyConfig(newChromakey)
    } catch (err) {
      console.error('保存抠图配置失败:', err)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <PersonStanding className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">化身</h1>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* 开关和尺寸设置 */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          {!configLoaded ? (
            // 加载骨架屏
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Power className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">启用化身</span>
                </div>
                <div className="w-10 h-5 rounded-full bg-muted animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">尺寸</span>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 rounded bg-muted animate-pulse" />
                  <div className="w-12 h-6 rounded bg-muted animate-pulse" />
                  <div className="w-12 h-6 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Power className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">启用化身</span>
                </div>
                <button
                  onClick={() => handleTogglePet(!petEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    petEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                      petEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">尺寸</span>
                <div className="flex items-center gap-2">
                  {[64, 128, 256].map(size => (
                    <button
                      key={size}
                      onClick={() => handleSizeChange(size)}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        petSize === size
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 抠图参数设置 */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">抠图参数</span>
          </div>
          <p className="text-xs text-muted-foreground">
            调整绿幕抠图参数，优化透明背景效果
          </p>

          {!configLoaded ? (
            // 加载骨架屏
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">抠图颜色</span>
                <div className="w-24 h-8 rounded bg-muted animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">相似度</span>
                <div className="w-36 h-5 rounded bg-muted animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">混合度</span>
                <div className="w-36 h-5 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">抠图颜色</span>
                <ColorSelect
                  value={chromakey.color}
                  onChange={(value) => handleChromakeyChange('color', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">相似度</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.1"
                    max="0.5"
                    step="0.01"
                    value={chromakey.similarity}
                    onChange={(e) => handleChromakeyChange('similarity', parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {chromakey.similarity.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">混合度</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="0.3"
                    step="0.01"
                    value={chromakey.blend}
                    onChange={(e) => handleChromakeyChange('blend', parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {chromakey.blend.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 动作配置 */}
        <DesktopPetConfig
          onSaved={loadPetState}
        />

        {/* 智能感知配置 */}
        <div className="bg-card rounded-lg border border-border p-4">
          <PetIntelligenceConfig />
        </div>
      </div>
    </div>
  )
}
