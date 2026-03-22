import { useState, useEffect } from 'react'
import { Plus, Trash2, User } from 'lucide-react'

interface CharacterLibraryProps {
  onSelect?: (character: CharacterItem) => void
  selectedId?: string | null
}

export default function CharacterLibrary({ onSelect, selectedId }: CharacterLibraryProps) {
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadCharacters()
  }, [])

  const loadCharacters = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI?.desktopPet?.getCharacterLibrary()
      if (res?.success && res.characters) {
        setCharacters(res.characters)
      }
    } catch (err) {
      console.error('加载形象库失败:', err)
    }
    setLoading(false)
  }

  const handleAddCharacter = async () => {
    try {
      setAdding(true)
      // 上传图片
      const uploadRes = await window.electronAPI?.desktopPet?.uploadImage()
      if (!uploadRes?.success || !uploadRes.dataUrl) {
        setAdding(false)
        return
      }

      // 添加到形象库
      const name = `形象_${Date.now()}`
      const res = await window.electronAPI?.desktopPet?.addCharacter({
        name,
        imageDataUrl: uploadRes.dataUrl,
      })
      if (res?.success && res.character) {
        setCharacters(prev => [...prev, res.character])
      }
    } catch (err) {
      console.error('添加形象失败:', err)
    }
    setAdding(false)
  }

  const handleDeleteCharacter = async (id: string) => {
    try {
      const res = await window.electronAPI?.desktopPet?.deleteCharacter(id)
      if (res?.success) {
        setCharacters(prev => prev.filter(c => c.id !== id))
      }
    } catch (err) {
      console.error('删除形象失败:', err)
    }
  }

  const handleSelect = (character: CharacterItem) => {
    onSelect?.(character)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">形象库</span>
        </div>
        <button
          onClick={handleAddCharacter}
          disabled={adding}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          {adding ? '添加中...' : '添加形象'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        保存白底形象图，生成动画时可直接选择
      </p>

      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-16 h-16 rounded-lg bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      ) : characters.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-xs">
          暂无形象，点击"添加形象"上传白底图片
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {characters.map(character => (
            <div
              key={character.id}
              className="relative group shrink-0"
            >
              <div
                className={`w-16 h-16 rounded-lg border overflow-hidden cursor-pointer transition-colors ${
                  selectedId === character.id
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary'
                }`}
                style={{ background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px' }}
                onClick={() => handleSelect(character)}
              >
                <img
                  src={character.imageDataUrl}
                  alt={character.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteCharacter(character.id)
                }}
                className="absolute -top-1 -right-1 p-1 rounded-full bg-destructive/80 text-destructive hover:bg-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
