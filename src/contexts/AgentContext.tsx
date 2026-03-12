import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface AgentTab {
  id: string
  name: string
  emoji?: string
  avatar?: string
}

interface AgentContextValue {
  agents: AgentTab[]
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  setAgents: (agents: AgentTab[] | ((prev: AgentTab[]) => AgentTab[])) => void
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentTab[]>([])
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  return (
    <AgentContext.Provider
      value={{
        agents,
        activeAgentId,
        setActiveAgentId,
        setAgents,
      }}
    >
      {children}
    </AgentContext.Provider>
  )
}

export function useAgentContext() {
  const ctx = useContext(AgentContext)
  return ctx
}
