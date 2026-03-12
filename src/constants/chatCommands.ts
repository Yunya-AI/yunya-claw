/** Gateway（OpenClaw）支持的快捷指令 */
export interface ChatCommand {
  cmd: string
  desc: string
  /** 客户端处理，不发给 Gateway */
  clientHandled?: boolean
}

export const CHAT_COMMANDS: ChatCommand[] = [
  // 客户端处理
  { cmd: '/new', desc: '新会话', clientHandled: true },
  { cmd: '/reset', desc: '重新开始', clientHandled: true },
  { cmd: '/clear', desc: '清空对话', clientHandled: true },
  { cmd: '/stop', desc: '中止当前回复', clientHandled: true },
  // 发送给 Gateway
  { cmd: '/help', desc: '显示可用指令' },
  { cmd: '/commands', desc: '列出所有斜杠指令' },
  { cmd: '/status', desc: '显示当前状态' },
  { cmd: '/context', desc: '说明上下文如何构建' },
  { cmd: '/compact', desc: '压缩会话上下文' },
  { cmd: '/whoami', desc: '显示发送者 ID' },
  { cmd: '/session', desc: '管理会话设置' },
  { cmd: '/model', desc: '显示或设置模型' },
  { cmd: '/models', desc: '列出模型' },
  { cmd: '/think', desc: '设置思考深度' },
  { cmd: '/usage', desc: '显示用量或成本' },
]
