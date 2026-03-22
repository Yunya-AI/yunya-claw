import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Settings,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  UserCircle2,
  Info,
  Plug2,
  Clock,
  PersonStanding,
} from 'lucide-react'
import { useAppearance } from '@/contexts/AppearanceContext'

export type PageKey = 'agents' | 'dashboard' | 'clipboard' | 'integrations' | 'cron' | 'persona' | 'models' | 'settings' | 'skills' | 'about' | 'desktoppet'

/** AI 图标：显示 "AI" 两字，颜色继承父级（未选中灰、选中橙） */
function AIIcon({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center justify-center w-4.5 h-4.5 min-w-4.5 shrink-0 text-[14px] font-semibold leading-none text-current translate-y-px', className)}>AI</span>
  )
}

interface SidebarProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  collapsed: boolean
  onToggle: () => void
}

const navItems: { key: PageKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'agents', label: '数字人', icon: Bot },
  { key: 'dashboard', label: '控制台', icon: LayoutDashboard },
  { key: 'integrations', label: '接入', icon: Plug2 },
  { key: 'cron', label: '定时', icon: Clock },
  { key: 'persona', label: '设定', icon: UserCircle2 },
  { key: 'skills', label: '技能', icon: Sparkles },
  { key: 'models', label: '模型', icon: AIIcon },
  { key: 'settings', label: '设置', icon: Settings },
  { key: 'about', label: '关于', icon: Info },
  { key: 'desktoppet', label: '化身', icon: PersonStanding },
]

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { appName, iconDataUrl } = useAppearance()

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-[#0d0d0d] border-r border-border shrink-0 transition-all duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center shrink-0 h-12 px-3', collapsed ? 'justify-center' : 'gap-2.5')}>
        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-muted/30">
          <img src={iconDataUrl || `${import.meta.env.BASE_URL}icon.png`} alt="" className="w-full h-full object-cover" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap overflow-hidden">
            {appName}
          </span>
        )}
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {navItems.map(({ key, label, icon: Icon }) => {
          // 化身菜单使用应用名称
          const displayLabel = key === 'desktoppet' ? appName : label
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg text-sm transition-colors cursor-pointer',
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                currentPage === key
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              )}
              title={collapsed ? displayLabel : undefined}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{displayLabel}</span>}
            </button>
          )
        })}
      </nav>

      {/* 收起按钮 */}
      <div className="px-2 py-3 border-t border-border">
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg py-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors cursor-pointer',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4.5 h-4.5" />
          ) : (
            <>
              <PanelLeftClose className="w-4.5 h-4.5" />
              <span className="text-sm whitespace-nowrap">收起</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
