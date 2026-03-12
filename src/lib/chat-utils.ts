/** 剥离 inbound metadata 块（Conversation info、Sender 等），与 OpenClaw strip-inbound-meta 逻辑一致 */
function stripInboundMetadata(text: string): string {
  const SENTINELS = [
    'Conversation info (untrusted metadata):',
    'Sender (untrusted metadata):',
    'Thread starter (untrusted, for context):',
    'Replied message (untrusted, for context):',
    'Forwarded message context (untrusted metadata):',
    'Chat history since last reply (untrusted, for context):',
  ]
  if (!text) return ''
  const hasSentinel = SENTINELS.some(s => text.includes(s))
  if (!hasSentinel) return text

  const lines = text.split('\n')
  const result: string[] = []
  let inMetaBlock = false
  let inFencedJson = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!inMetaBlock && SENTINELS.some(s => trimmed === s)) {
      const next = lines[i + 1]?.trim()
      if (next === '```json') {
        inMetaBlock = true
        inFencedJson = false
        continue
      }
    }
    if (inMetaBlock) {
      if (!inFencedJson && trimmed === '```json') {
        inFencedJson = true
        continue
      }
      if (inFencedJson) {
        if (trimmed === '```') {
          inMetaBlock = false
          inFencedJson = false
        }
        continue
      }
      if (trimmed === '') continue
      inMetaBlock = false
    }
    result.push(line)
  }
  return result.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

/** 截取 [Current message - respond to this]\nUser: 之后的内容（群组上下文注入格式） */
function stripCurrentMessagePrefix(text: string): string {
  const prefix = '[Current message - respond to this]\nUser: '
  const idx = text.indexOf(prefix)
  return idx >= 0 ? text.slice(idx + prefix.length).trimStart() : text
}

/** 剥离行首 [message_id: xxx] 前缀 */
function stripMessageIdPrefix(text: string): string {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end > 0) return trimmed.slice(end + 1).trimStart()
  }
  return trimmed
}

/** 用户侧展示用：剥离 OpenClaw 注入的上下文与渠道元数据，只保留用户实际输入 */
export function stripUserMessageForDisplay(text: string): string {
  if (!text) return ''

  // 1. [Current message - respond to this]\nUser: 格式（群组上下文注入）
  let content = stripCurrentMessagePrefix(text)

  // 2. inbound metadata 块（飞书/QQ 等渠道的 Conversation info、Sender 等）
  content = stripInboundMetadata(content)

  // 3. [message_id: xxx] 前缀
  content = stripMessageIdPrefix(content)

  return content.trimStart()
}
