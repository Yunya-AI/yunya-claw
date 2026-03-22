import { useState, useEffect } from 'react'
import { Cat, Power, Settings2 } from 'lucide-react'
import DesktopPetConfig from '@/components/DesktopPetConfig'

interface ChromakeyConfig {
  color: string
  similarity: number
  blend: number
}

export default function DesktopPetConfigPage() {
  const [petEnabled, setPetEnabled] = useState(false)
  const [petSize, setPetSize] = useState(128)
  const [chromakey, setChromakey] = useState<ChromakeyConfig>({
    color: '0x00FF00',
    similarity: 0.27,
    blend: 0.1,
  })

  // 加载桌宠状态
  useEffect(() => {
    loadPetState()
  }, [])

  const loadPetState = async () => {
    try {
      if (!window.electronAPI?.desktopPet?.getConfig) return
      const res = await window.electronAPI.desktopPet.getConfig()
      if (res?.success && res.config) {
        setPetEnabled(res.config.enabled)
        setPetSize(res.config.size || 128)
        if (res.config.chromakeyColor) {
          setChromakey({
            color: res.config.chromakeyColor,
            similarity: res.config.chromakeySimilarity ?? 0.27,
            blend: res.config.chromakeyBlend ?? 0.1,
          })
        }
      }
    } catch (err) {
      console.error('加载桌宠状态失败:', err)
    }
  }

  const handleTogglePet = async (enable: boolean) => {
    try {
      if (!window.electronAPI?.desktopPet?.toggle) return
      const res = await window.electronAPI.desktopPet.toggle(enable)
      if (res?.success) {
        setPetEnabled(res.enabled ?? enable)
      }
    } catch (err) {
      console.error('切换桌宠状态失败:', err)
    }
  }

  const handleSizeChange = async (size: number) => {
    try {
      if (!window.electronAPI?.desktopPet?.setSize) return
      const res = await window.electronAPI.desktopPet.setSize(size)
      console.log('[DesktopPetConfigPage] setSize result:', res)
      setPetSize(size)
    } catch (err) {
      console.error('设置桌宠大小失败:', err)
    }
  }

  const handleChromakeyChange = async (key: keyof ChromakeyConfig, value: string | number) => {
    const newChromakey = { ...chromakey, [key]: value }
    setChromakey(newChromakey)

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
          <Cat className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">桌宠</h1>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* 开关和尺寸设置 */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Power className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">启用桌宠</span>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">抠图颜色</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded border border-border"
                  style={{ backgroundColor: `#${chromakey.color.replace('0x', '')}` }}
                />
                <select
                  value={chromakey.color}
                  onChange={(e) => handleChromakeyChange('color', e.target.value)}
                  className="h-8 bg-input border border-border rounded px-2 text-sm"
                >
                  <option value="0x00FF00">绿色 (推荐)</option>
                  <option value="0x0000FF">蓝色</option>
                  <option value="0xFF0000">红色</option>
                  <option value="0x000000">黑色</option>
                  <option value="0xFFFFFF">白色</option>
                </select>
              </div>
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
        </div>

        {/* 动作配置 */}
        <DesktopPetConfig onSaved={loadPetState} />
      </div>
    </div>
  )
}
