import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface AppearanceContextValue {
  appName: string
  iconDataUrl: string | null
  refresh: () => Promise<void>
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appName, setAppName] = useState('Yunya Claw')
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.appearance) return
    try {
      const res = await window.electronAPI.appearance.get()
      if (res) {
        setAppName(res.appName)
        document.title = res.appName
      }
      const url = await window.electronAPI.appearance.getIconDataUrl()
      setIconDataUrl(url)
    } catch (err) {
      console.error('[Appearance] 加载失败:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    document.title = appName
  }, [appName])

  return (
    <AppearanceContext.Provider value={{ appName, iconDataUrl, refresh }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext)
  return ctx ?? { appName: 'Yunya Claw', iconDataUrl: null, refresh: async () => {} }
}
