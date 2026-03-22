import { useState, useRef, useCallback, useEffect } from 'react'
import TitleBar from '@/components/layout/TitleBar'
import Sidebar, { type PageKey } from '@/components/layout/Sidebar'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelsPage from '@/pages/ModelsPage'
import SkillsPage from '@/pages/SkillsPage'
import AgentPage from '@/pages/AgentPage'
import PersonaPage from '@/pages/PersonaPage'
import AboutPage from '@/pages/AboutPage'
import DesktopPetConfigPage from '@/pages/DesktopPetConfigPage'
import IntegrationsPage from '@/pages/IntegrationsPage'
import CronPage from '@/pages/CronPage'
import ClipboardPage from '@/pages/ClipboardPage'
import QuickPastePage from '@/pages/QuickPastePage'
import DesktopPetPage from '@/pages/DesktopPetPage'
import { GatewayProvider } from '@/contexts/GatewayContext'
import { AgentProvider } from '@/contexts/AgentContext'
import { AppearanceProvider } from '@/contexts/AppearanceContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppLifecycleOverlay from '@/components/AppLifecycleOverlay'

function KeepAlive({ active, children }: { active: boolean; children: React.ReactNode }) {
  const mountedRef = useRef(false)
  if (active) mountedRef.current = true
  if (!mountedRef.current) return null
  return (
    <div className={active ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}>
      {children}
    </div>
  )
}

// 检查是否是快捷粘贴窗口模式
const urlParams = new URLSearchParams(window.location.search)
const isQuickPasteMode = urlParams.get('mode') === 'quickpaste'
const isDesktopPetMode = urlParams.get('mode') === 'desktoppet'

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('agents')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [configVersion, setConfigVersion] = useState(0)
  const handleConfigSaved = useCallback(() => setConfigVersion(v => v + 1), [])

  // 化身模式：设置透明背景
  useEffect(() => {
    if (isDesktopPetMode) {
      document.body.classList.add('desktop-pet-mode')
    }
  }, [])

  if (isQuickPasteMode) {
    return <QuickPastePage />
  }

  if (isDesktopPetMode) {
    return (
      <ErrorBoundary>
        <DesktopPetPage />
      </ErrorBoundary>
    )
  }

  return (
    <GatewayProvider>
      <AgentProvider>
      <AppearanceProvider>
      <div className="h-screen flex flex-col">
        <TitleBar />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <main className="flex-1 flex flex-col overflow-hidden bg-background">
            <ErrorBoundary>
            {/* 数字人（默认页） */}
            <div className={currentPage === 'agents' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}>
              <AgentPage onNavigateToModels={() => setCurrentPage('models')} configVersion={configVersion} />
            </div>
            <KeepAlive active={currentPage === 'dashboard'}>
              <DashboardPage />
            </KeepAlive>
            <KeepAlive active={currentPage === 'clipboard'}>
              <ClipboardPage active={currentPage === 'clipboard'} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'integrations'}>
              <IntegrationsPage />
            </KeepAlive>
            <KeepAlive active={currentPage === 'cron'}>
              <CronPage active={currentPage === 'cron'} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'models'}>
              <ModelsPage active={currentPage === 'models'} onSaved={handleConfigSaved} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'settings'}>
              <SettingsPage active={currentPage === 'settings'} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'skills'}>
              <SkillsPage />
            </KeepAlive>
            <KeepAlive active={currentPage === 'persona'}>
              <PersonaPage active={currentPage === 'persona'} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'about'}>
              <AboutPage onNavigate={setCurrentPage} />
            </KeepAlive>
            <KeepAlive active={currentPage === 'desktoppet'}>
              <DesktopPetConfigPage />
            </KeepAlive>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      </AppearanceProvider>
      </AgentProvider>
      <AppLifecycleOverlay />
    </GatewayProvider>
  )
}
