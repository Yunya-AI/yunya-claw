import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot } from 'lucide-react'

import { useGateway } from '@/contexts/GatewayContext'
import ChatInputBar from './ChatInputBar'
import ChatMessageRow from './ChatMessageRow'

interface Props {
  /** OpenClaw sessionKey，格式 agent:agentId:main 或 agent:agentId:xxx */
  sessionKey: string
  agentId: string
  /** 该数字人配置的模型（来自 agents.list[].model），用于初始值 */
  agentModel?: string
  /** 底部模型切换时通知父组件更新 */
  onAgentModelChange?: (agentId: string, model: string) => void
  onSessionUpdated: (session: ChatSession) => void
  /** 无可用模型时，点击提示跳转到 AI 模型页 */
  onNavigateToModels?: () => void
  /** 模型配置版本号，变化时重新加载可用模型列表 */
  configVersion?: number
}

interface ModelOption {
  fullId: string    // "provider/model-id"，发送给 Gateway
  displayName: string
  provider: string
}

export default function ChatPanel({ sessionKey, agentId, agentModel, onAgentModelChange, onSessionUpdated, onNavigateToModels, configVersion }: Props) {
  const { port: gatewayPort, token: gatewayToken, status: gatewayStatus, initializing: gatewayInitializing } = useGateway()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState('')
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelReady, setModelReady] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const currentRunIdRef = useRef<string | null>(null)
  const modelRef = useRef(model)
  modelRef.current = model
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [pendingMessageAfterReset, setPendingMessageAfterReset] = useState<string | null>(null)

  /** 流式回复期间轮询 transcript，尽早展示工具调用和结果（agent 写入有延迟，固定 2s 后加载会等很久） */
  useEffect(() => {
    if (!streaming || !window.electronAPI) return
    const poll = async () => {
      try {
        const res = await window.electronAPI.chat.loadOpenClawTranscript(sessionKey)
        if (!res.success || !res.messages?.length) return
        const transcriptMsgs = res.messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
        const last = transcriptMsgs[transcriptMsgs.length - 1]
        const hasToolContent = last?.role === 'assistant' &&
          (last.content.includes('<tool_call>') || last.content.includes('<tool_result>'))
        setMessages(prev => {
          if (!hasToolContent) return prev
          return transcriptMsgs
        })
      } catch { /* 忽略 */ }
    }
    const t = setInterval(poll, 1500)
    return () => clearInterval(t)
  }, [streaming, sessionKey])

  /** 监听外部渠道（如微信、钉钉）触发的对话刷新事件 */
  useEffect(() => {
    if (!window.electronAPI?.gateway?.onChatRefresh) return
    const unsubscribe = window.electronAPI.gateway.onChatRefresh((data) => {
      // 流式回复期间不覆盖，避免 chatRefresh（agent idle→thinking）覆盖正在进行的流式状态
      if (streaming) return
      // sessionKey 匹配时刷新消息（未指定 sessionKey 时也刷新）
      if (!data.sessionKey || data.sessionKey === sessionKey) {
        // 重新加载 transcript
        window.electronAPI.chat.loadOpenClawTranscript(sessionKey).then(res => {
          if (res.success && res.messages && res.messages.length > 0) {
            const transcriptMsgs = res.messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
            setMessages(transcriptMsgs)
          }
        }).catch(() => { /* 忽略 */ })
      }
    })
    return unsubscribe
  }, [sessionKey, streaming])

  // 统一初始化：config + session + transcript 并行加载；config 和 session 就绪后立即显示模型，不等待 transcript
  useEffect(() => {
    const init = async () => {
      setModelReady(false)
      if (!window.electronAPI) {
        setModelReady(true)
        return
      }

      const configPromise = window.electronAPI.config.read()
      const sessionPromise = window.electronAPI.chat.loadSession(sessionKey)
      const transcriptPromise = window.electronAPI.chat.loadOpenClawTranscript(sessionKey)

      // 1. 等 config + session 就绪后立即解析并显示模型（transcript 继续在后台加载）
      let opts: ModelOption[] = []
      let sessionResult: { success: boolean; session?: ChatSession } = { success: false }
      try {
        const [config, sessRes] = await Promise.all([configPromise, sessionPromise])
        sessionResult = sessRes

        const providersRaw = (config as Record<string, unknown>).models
        const providers = (providersRaw as Record<string, unknown>)?.providers as Record<string, Record<string, unknown>> | undefined
        if (providers) {
          for (const [providerKey, pConfig] of Object.entries(providers)) {
            const enabled = (pConfig as Record<string, unknown>).enabled
            if (enabled === false) continue
            const pModels = (pConfig as Record<string, unknown>).models as Array<{ id: string; name?: string }> | undefined
            if (!pModels) continue
            for (const m of pModels) {
              opts.push({
                fullId: `${providerKey}/${m.id}`,
                displayName: m.name || m.id,
                provider: providerKey,
              })
            }
          }
        }
        let resolvedModel = opts[0]?.fullId || ''
        let hasSessionModel = false
        if (sessionResult.success && sessionResult.session) {
          const savedModel = sessionResult.session.model || ''
          if (savedModel.includes('/')) {
            resolvedModel = savedModel
            hasSessionModel = true
          } else if (savedModel) {
            const matched = opts.find(o => o.displayName === savedModel || o.fullId.endsWith(`/${savedModel}`))
            if (matched) {
              resolvedModel = matched.fullId
              hasSessionModel = true
            }
          }
        }
        if (!hasSessionModel && agentModel && agentModel.includes('/') && opts.some(o => o.fullId === agentModel)) {
          resolvedModel = agentModel
        }
        setModels(opts)
        setModel(resolvedModel)
        setModelReady(true)
      } catch (err) {
        console.error('加载配置/会话失败:', err)
        setModelReady(true)
      }

      // 2. 等待 transcript 完成，设置消息（与上面并行启动，总耗时不变）
      try {
        const transcriptResult = await transcriptPromise
        let msgs: ChatMessage[] = []
        if (transcriptResult.success && transcriptResult.messages && transcriptResult.messages.length > 0) {
          msgs = transcriptResult.messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
        } else if (sessionResult.success && sessionResult.session?.messages) {
          msgs = sessionResult.session.messages
        }
        setMessages(msgs)
      } catch (err) {
        console.error('加载消息失败:', err)
      }
    }

    void init()
  }, [sessionKey, configVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const saveSession = useCallback(async (msgs: ChatMessage[], modelOverride?: string) => {
    if (!window.electronAPI) return
    const m = modelOverride ?? modelRef.current
    const title = msgs.find(m0 => m0.role === 'user')?.content.slice(0, 30) || '新会话'
    const session: ChatSession = {
      id: sessionKey,
      title,
      messages: msgs,
      model: m,
      createdAt: msgs[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    }
    await window.electronAPI.chat.saveSession(session)
    onSessionUpdated(session)
  }, [sessionKey, onSessionUpdated])

  const handleModelChange = useCallback(async (newModel: string) => {
    setModel(newModel)
    onAgentModelChange?.(agentId, newModel)
    if (!window.electronAPI) return
    await window.electronAPI.config.saveAgentModel(agentId, newModel)
    await saveSession(messages, newModel)
  }, [agentId, messages, saveSession, onAgentModelChange])

  const canSend = gatewayStatus === 'running' && !streaming

  const handleSend = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || !canSend) return

    // OpenClaw 默认指令：部分由客户端处理，不发给大模型
    const lower = trimmed.toLowerCase()
    const isAbort = lower === '/abort' || lower === '/stop'
    if (isAbort) {
      abortRef.current?.abort()
      setStreaming(false)
      return
    }
    const isNew = lower === '/new' || lower.startsWith('/new ')
    const isReset = lower === '/reset' || lower.startsWith('/reset ')
    const isClear = lower === '/clear' || lower.startsWith('/clear ')
    if (isNew || isReset || isClear) {
      const postMsg = (isNew ? trimmed.slice(5) : isReset ? trimmed.slice(7) : trimmed.slice(7)).trim()
      try {
        const res = await window.electronAPI?.chat.resetGatewaySession(sessionKey, isNew || isClear ? 'new' : 'reset')
        if (res?.success) {
          setMessages([])
          await saveSession([])
          if (postMsg) setPendingMessageAfterReset(postMsg)
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `\u26a0\ufe0f 重置失败: ${res?.error || '未知错误'}`, timestamp: Date.now() }])
        }
      } catch (err) {
        setMessages(prev => [...prev, { role: 'assistant', content: `\u26a0\ufe0f 重置失败: ${(err as Error).message}`, timestamp: Date.now() }])
      }
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() }
    setMessages([...newMessages, assistantMsg])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller
    currentRunIdRef.current = null

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
      const gatewayUrl = `http://127.0.0.1:${gatewayPort}/v1/chat/completions`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-OpenClaw-Session-Key': sessionKey,
        'X-OpenClaw-Agent-Id': agentId,
      }
      if (gatewayToken) {
        headers['Authorization'] = `Bearer ${gatewayToken}`
      }
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: apiMessages, stream: true }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gateway 返回 ${response.status}: ${errText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法获取响应流')

      const decoder = new TextDecoder()
      let accumulated = ''
      let reasoningAccumulated = ''
      let streamError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.id && !currentRunIdRef.current) {
              currentRunIdRef.current = parsed.id
            }
            const errMsg = parsed.error?.message ?? parsed.error
            if (typeof errMsg === 'string' && errMsg.trim()) {
              streamError = streamError ? `${streamError}\n${errMsg}` : errMsg
            }
            const deltaObj = parsed.choices?.[0]?.delta
            const contentDelta = deltaObj?.content
            const reasoningDelta = deltaObj?.reasoning_content
            if (contentDelta) accumulated += contentDelta
            if (reasoningDelta) reasoningAccumulated += reasoningDelta
            if (contentDelta || reasoningDelta) {
              let finalContent = accumulated
              if (reasoningAccumulated) {
                finalContent = '<thinking>' + reasoningAccumulated + '</thinking>\n' + accumulated
              }
              setMessages(prev => {
                const last = prev[prev.length - 1]
                const hasToolContent = last?.content?.includes('<tool_call') || last?.content?.includes('<tool_result>')
                if (hasToolContent) {
                  return prev
                }
                const updated = [...prev]
                updated[updated.length - 1] = { ...last, content: finalContent }
                return updated
              })
            }
          } catch { /* 跳过 */ }
        }
      }

      let finalContent = reasoningAccumulated
        ? '<thinking>' + reasoningAccumulated + '</thinking>' + (accumulated ? '\n' + accumulated : '')
        : (accumulated || streamError || '⚠️ 请求失败，请重试或使用 /reset 开始新会话。')
      const finalMessages = [...newMessages, { ...assistantMsg, content: finalContent }]
      // 优先从 transcript 加载（含工具调用或纯文本）；给 agent 写入时间，失败时重试一次
      const syncFromTranscript = async () => {
        const tryLoad = async (delayMs: number) => {
          await new Promise(r => setTimeout(r, delayMs))
          if (!window.electronAPI) return null
          try {
            const res = await window.electronAPI.chat.loadOpenClawTranscript(sessionKey)
            if (res.success && res.messages && res.messages.length > 0) {
              // transcript 比 SSE accumulated 更可靠（agent 直接写入，包含工具调用）
              const transcriptMsgs = res.messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
              const hasNewContent = transcriptMsgs.some(m =>
                m.role === 'assistant' && m.content && m.content !== ''
              )
              if (hasNewContent) return transcriptMsgs
            }
          } catch { /* 忽略 */ }
          return null
        }
        return (await tryLoad(400)) ?? (await tryLoad(600)) ?? finalMessages
      }
      const msgs = await syncFromTranscript()
      setMessages(msgs)
      await saveSession(msgs)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        let msg = (err as Error).message
        if (msg.includes('413') || /too large|Request Entity Too Large/i.test(msg)) {
          msg = '上下文过长，请使用 /reset 开始新会话，或换用更大上下文的模型。'
        } else if (msg.length > 200) {
          msg = msg.slice(0, 200) + '…'
        }
        const errContent = `\u26a0\ufe0f 请求失败: ${msg}`
        const finalMessages = [...newMessages, { ...assistantMsg, content: errContent }]
        setMessages(finalMessages)
        await saveSession(finalMessages)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      currentRunIdRef.current = null
    }
  }, [gatewayPort, gatewayToken, sessionKey, agentId, model, messages, canSend, saveSession])

  useEffect(() => {
    if (pendingMessageAfterReset && messages.length === 0 && canSend) {
      const msg = pendingMessageAfterReset
      setPendingMessageAfterReset(null)
      handleSend(msg)
    }
  }, [pendingMessageAfterReset, messages.length, canSend, handleSend])

  const handleStop = () => {
    void window.electronAPI?.chat?.abort(sessionKey, currentRunIdRef.current ?? undefined)
    abortRef.current?.abort()
    setStreaming(false)
  }

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
              <div className="text-center">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                {modelReady && models.length === 0 && onNavigateToModels ? (
                  <>
                    <p className="text-sm">暂无可用模型，请先添加 AI 模型</p>
                    <button
                      onClick={onNavigateToModels}
                      className="mt-3 text-sm text-primary hover:underline"
                    >
                      去添加 AI 模型 →
                    </button>
                  </>
                ) : (
                  <p className="text-sm">发送消息开始对话</p>
                )}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <ChatMessageRow
              key={idx}
              msg={msg}
              idx={idx}
              isLast={idx === messages.length - 1}
              streaming={streaming}
              copiedIdx={copiedIdx}
              onCopy={handleCopy}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInputBar
        onSend={handleSend}
        canSend={canSend}
        streaming={streaming}
        onStop={handleStop}
        model={model}
        models={models}
        modelReady={modelReady}
        onModelChange={handleModelChange}
        gatewayPort={gatewayPort}
        gatewayStatus={gatewayStatus}
        gatewayInitializing={gatewayInitializing}
      />
    </div>
  )
}
