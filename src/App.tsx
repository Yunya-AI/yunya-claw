import { useState, useRef, useCallback } from 'react'
import TitleBar from '@/components/layout/TitleBar'
import Sidebar, { type PageKey } from '@/components/layout/Sidebar'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelsPage from '@/pages/ModelsPage'
import SkillsPage from '@/pages/SkillsPage'
import AgentPage from '@/pages/AgentPage'
import PersonaPage from '@/pages/PersonaPage'
import AboutPage from '@/pages/AboutPage'
import IntegrationsPage from '@/pages/IntegrationsPage'
import CronPage from '@/pages/CronPage'
import { GatewayProvider } from '@/contexts/GatewayContext'
import { AgentProvider } from '@/contexts/AgentContext'
import { AppearanceProvider } from '@/contexts/AppearanceContext'
import ErrorBoundary from '@/components/ErrorBoundary'

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

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('agents')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [configVersion, setConfigVersion] = useState(0)
  const handleConfigSaved = useCallback(() => setConfigVersion(v => v + 1), [])

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
              <AboutPage />
            </KeepAlive>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      </AppearanceProvider>
      </AgentProvider>
    </GatewayProvider>
  )
}
