import { memo } from 'react'
import { User, Bot, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripUserMessageForDisplay } from '@/lib/chat-utils'
import MessageContent from './MessageContent'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface Props {
  msg: ChatMessage
  idx: number
  isLast: boolean
  streaming: boolean
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}

function ChatMessageRow({ msg, idx, isLast, streaming, copiedIdx, onCopy }: Props) {
  return (
    <div className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : '')}>
      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] relative group',
          msg.role === 'user'
            ? 'bg-primary/15 rounded-2xl rounded-br-md px-4 py-2.5'
            : 'flex-1 min-w-0'
        )}
      >
        {msg.role === 'user' ? (
          <MessageContent content={stripUserMessageForDisplay(msg.content || '')} streaming={false} isLast={isLast} />
        ) : (
          <MessageContent content={msg.content || ''} streaming={streaming} isLast={isLast} />
        )}

        {msg.role === 'assistant' && msg.content && !streaming && (
          <button
            onClick={() => onCopy(msg.content, idx)}
            className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-secondary hover:bg-secondary/80"
            title="复制"
          >
            {copiedIdx === idx ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
      {msg.role === 'user' && (
        <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export default memo(ChatMessageRow)
