import { Minus, Square, X } from 'lucide-react'
import { useAppearance } from '@/contexts/AppearanceContext'

export default function TitleBar() {
  const { appName } = useAppearance()
  const handleMinimize = () => window.electronAPI?.window.minimize()
  const handleMaximize = () => window.electronAPI?.window.maximize()
  const handleClose = () => window.electronAPI?.window.close()

  return (
    <div className="drag-region flex items-center justify-between h-9 bg-background border-b border-border shrink-0 select-none">
      <div className="flex items-center gap-2 pl-4">
        <span className="text-xs text-muted-foreground font-medium tracking-wide">{appName}</span>
      </div>

      <div className="no-drag flex h-full">
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <Minus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3.5 hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <Square className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3.5 hover:bg-red-600 transition-colors flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground hover:text-white" />
        </button>
      </div>
    </div>
  )
}
