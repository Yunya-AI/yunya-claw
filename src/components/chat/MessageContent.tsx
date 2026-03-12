import { useState, useEffect, useRef, memo } from 'react'
import { ChevronDown, ChevronRight, Wrench, FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import toolDisplayConfig from '@/config/tool-display.json'

// ---- 图片 URL 提取工具 ----

/** 判断是否是本地 openclaw 媒体协议或 file:// */
function isLocalMediaUrl(url: string) {
  return url.startsWith('screenshot://') || url.startsWith('media://') || url.startsWith('file://')
}

/** 判断是否是远程图片 URL（排除纯文本如 "image" 被误识别） */
function isRemoteImageUrl(url: string) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url)
    || /^https?:\/\/.+\/(?:screenshot|image|photo|thumb|img)(?:\/|$|\?)/i.test(url)
}

/** 排除 OpenClaw read 工具的标签（如 "Read image file [image/png]"），非真实路径 */
function isReadImageLabel(s: string): boolean {
  return /^Read image file \[image\/[^\]]+\]$/i.test(s.trim())
}

/** 排除纯文本词（如 "image"）被误识别为图片 URL */
const STANDALONE_IMAGE_WORDS = /^(image|img|photo|screenshot|thumb)$/i

/** 排除 exec 输出、XML 等非图片内容被误识别为图片路径 */
function isExecOutputOrXml(s: string): boolean {
  const t = s.trim()
  return (
    t.includes('<?xml') ||
    /UI\s*hier(ch)?ary|dumped\s+to|uiautomator\s+dump/i.test(t) ||
    /\.xml\s*[<\s"'<>)]|\.xml$/i.test(t) ||
    (t.length > 200 && /<[a-z][\s>]|>\s*\w/i.test(t))
  )
}

/** 从任意值（字符串、对象、数组）中递归提取所有图片 URL */
function extractImageUrls(val: unknown, seen = new Set<string>()): string[] {
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (STANDALONE_IMAGE_WORDS.test(trimmed) || isReadImageLabel(trimmed) || isExecOutputOrXml(trimmed)) return []
    if (
      (trimmed.startsWith('screenshot://') || trimmed.startsWith('media://')) ||
      isRemoteImageUrl(trimmed) ||
      isLocalMediaPath(trimmed)
    ) {
      if (!seen.has(trimmed)) { seen.add(trimmed); return [trimmed] }
    }
    // markdown 图片语法 ![...](url)
    const mdImgRe = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g
    let m: RegExpExecArray | null
    const results: string[] = []
    while ((m = mdImgRe.exec(trimmed)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); results.push(m[1]) }
    }
    return results
  }
  if (Array.isArray(val)) {
    return val.flatMap(item => extractImageUrls(item, seen))
  }
  if (val && typeof val === 'object') {
    return Object.values(val as Record<string, unknown>).flatMap(v => extractImageUrls(v, seen))
  }
  return []
}

/** 判断是否是本地 openclaw 媒体文件路径（Windows 或 Unix）或 file:// */
function isLocalMediaPath(url: string): boolean {
  const normalized = url.replace(/\\/g, '/')
  return (
    url.startsWith('file://') ||
    /\.openclaw\/media\/browser\/[^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/i.test(normalized) ||
    /media[/\\]browser[/\\][^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/i.test(normalized) ||
    /\.openclaw[\\/]workspaces[\\/][^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/i.test(normalized) ||
    /[A-Za-z]:[\\/][^\s"'<>)]*\.openclaw[\\/]workspaces[\\/][^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/i.test(normalized)
  )
}

/** 从 tool_result 或任意文本中提取所有图片 URL */
function extractImagesFromResult(raw: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  // 1. 尝试 JSON 解析，递归提取
  try {
    const parsed = JSON.parse(raw)
    results.push(...extractImageUrls(parsed, seen))
  } catch { /* 非 JSON */ }

  // 2. 全文正则兜底：screenshot:// 和 media://
  const localRe = /(screenshot|media):\/\/[^\s"'<>)]+/g
  let m: RegExpExecArray | null
  while ((m = localRe.exec(raw)) !== null) {
    if (!seen.has(m[0])) { seen.add(m[0]); results.push(m[0]) }
  }

  // 3. 全文正则兜底：http/https 图片 URL
  const remoteRe = /https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s"'<>)]*)?/gi
  while ((m = remoteRe.exec(raw)) !== null) {
    if (!seen.has(m[0])) { seen.add(m[0]); results.push(m[0]) }
  }

  // 4. 本地文件路径：.openclaw/media/browser/xxx.png 或 C:\...\media\browser\xxx.png
  const pathRe = /[^\s"'<>)]*\.openclaw[\\/]media[\\/]browser[\\/][^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/gi
  while ((m = pathRe.exec(raw)) !== null) {
    const path = m[0].trim()
    if (!seen.has(path)) { seen.add(path); results.push(path) }
  }

  // 4b. workspace 路径：.openclaw/workspaces/xxx/screen2.png 或 C:\...\.openclaw\workspaces\xxx\screen2.png
  const workspacePathRe = /[^\s"'<>)]*\.openclaw[\\/]workspaces[\\/][^\s"'<>)]+\.(?:png|jpe?g|gif|webp|bmp)/gi
  while ((m = workspacePathRe.exec(raw)) !== null) {
    const p = m[0].trim()
    if (!seen.has(p)) { seen.add(p); results.push(p) }
  }

  // 5. file:// 协议（含 Windows file:///C:/ 和 Unix file:///path）
  const fileRe = /file:\/\/[^\s"'<>)]+/gi
  while ((m = fileRe.exec(raw)) !== null) {
    const p = m[0].trim()
    if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(p) && !seen.has(p)) {
      seen.add(p)
      results.push(p)
    }
  }

  return results.filter(u => !STANDALONE_IMAGE_WORDS.test(u) && !isReadImageLabel(u) && !isExecOutputOrXml(u))
}

// ---- 类型定义 ----

interface ToolCallBlock {
  type: 'tool_call'
  name: string
  args: Record<string, unknown>
  images: string[]   // 从 args 中解析的图片路径（如 file_path）
  raw: string
}

interface ToolResultBlock {
  type: 'tool_result'
  content: string
  images: string[]   // 所有图片 URL（本地 + 远程）
  title?: string
  raw: string
}

interface TextBlock {
  type: 'text'
  content: string
  inlineImages?: string[]
}

interface ThinkingBlock {
  type: 'thinking'
  content: string
}

type MessageBlock = ToolCallBlock | ToolResultBlock | TextBlock | ThinkingBlock

// ---- 解析函数 ----

export function parseMessageBlocks(raw: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const re = /<(tool_call|tool_result|thinking)>([\s\S]*?)<\/\1>/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      const text = raw.slice(last, match.index).trim()
      if (text) {
        const inlineImages = extractImagesFromResult(text)
        blocks.push(inlineImages.length > 0 ? { type: 'text', content: text, inlineImages } : { type: 'text', content: text })
      }
    }

    const tag = match[1] as 'tool_call' | 'tool_result' | 'thinking'
    const inner = match[2].trim()

    if (tag === 'thinking') {
      blocks.push({ type: 'thinking', content: inner })
    } else if (tag === 'tool_call') {
      try {
        const parsed = JSON.parse(inner) as { name?: string; arguments?: Record<string, unknown>; args?: Record<string, unknown> }
        const args = parsed.arguments ?? parsed.args ?? {}
        const callImages = extractImagesFromResult(inner)
        blocks.push({
          type: 'tool_call',
          name: parsed.name || '未知工具',
          args,
          images: callImages,
          raw: inner,
        })
      } catch {
        blocks.push({ type: 'text', content: match[0] })
      }
    } else {
      // 提取所有图片
      const images = extractImagesFromResult(inner)

      // 提取 title，显示摘要
      let title: string | undefined
      let content = inner
      try {
        const parsed = JSON.parse(inner) as Record<string, unknown>
        if (typeof parsed.title === 'string') title = parsed.title
        // 从展示内容中删掉图片 URL，避免重复
        const cleaned = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>
        const removeImageUrls = (obj: Record<string, unknown>) => {
          for (const key of Object.keys(obj)) {
            const v = obj[key]
            if (typeof v === 'string' && (isLocalMediaUrl(v) || isRemoteImageUrl(v))) {
              delete obj[key]
            } else if (v && typeof v === 'object' && !Array.isArray(v)) {
              removeImageUrls(v as Record<string, unknown>)
            }
          }
        }
        removeImageUrls(cleaned)
        content = JSON.stringify(cleaned, null, 2)
      } catch { /* 非 JSON */ }

      blocks.push({ type: 'tool_result', content, images, title, raw: inner })
    }

    last = match.index + match[0].length
  }

  if (last < raw.length) {
    const text = raw.slice(last).trim()
    if (text) blocks.push({ type: 'text', content: text })
  }

  if (blocks.length === 0 && raw.trim()) {
    const images = extractImagesFromResult(raw)
    return [{ type: 'text', content: raw, inlineImages: images }]
  }

  // 对纯文本块也提取内联图片（兜底：无 tool_result 标签时仍能展示图片）
  return blocks.map(b => {
    if (b.type === 'text' && b.content) {
      const inlineImages = extractImagesFromResult(b.content)
      return inlineImages.length > 0 ? { ...b, inlineImages } : b
    }
    return b
  })
}

// ---- 单张图片组件 ----

function ImagePreview({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isLocal = isLocalMediaUrl(url) || isLocalMediaPath(url)
  const isRemote = url.startsWith('http://') || url.startsWith('https://')

  useEffect(() => {
    if (!contextMenu) return
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [contextMenu])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDataUrl(null)

    if (isLocal) {
      const p = url.trim()
      const done = (res: { success: boolean; dataUrl?: string; error?: string }) => {
        if (cancelled) return
        if (res.success && res.dataUrl) setDataUrl(res.dataUrl)
        else setError(res.error || '读取失败')
        setLoading(false)
      }
      window.electronAPI!.media.readFile(p).then((res) => {
        if (res.success) return done(res)
        const m = p.match(/[/\\]media[/\\]browser[/\\]([^/\\]+\.(?:png|jpe?g|gif|webp|bmp))$/i)
        if (m) {
          window.electronAPI!.media.readFile(`screenshot://browser/${m[1]}`).then(done).catch(() => {
            if (!cancelled) { setError('读取失败'); setLoading(false) }
          })
        } else {
          done(res)
        }
      }).catch((err) => {
        if (!cancelled) { setError(String(err)); setLoading(false) }
      })
    } else {
      // 远程图片直接用 src，让浏览器加载
      setDataUrl(url)
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [url, isLocal])

  if (loading) {
    return (
      <div className="h-8 flex items-center gap-2 text-xs text-muted-foreground/40">
        <span className="animate-pulse">加载图片中…</span>
      </div>
    )
  }

  if (error) {
    const pathDisplay = url.length > 60 ? `${url.slice(0, 50)}…${url.slice(-8)}` : url
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground/40 py-1" title={error}>
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-red-400/50 shrink-0" />
          <span>图片已过期或无法加载</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 break-all font-mono">{pathDisplay}</span>
      </div>
    )
  }

  if (!dataUrl) return null

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setContextMenu(null)
    } catch { /* 忽略 */ }
  }

  const handleOpenInBrowser = () => {
    if (!isRemote) return
    if (window.electronAPI?.util?.openExternal) {
      window.electronAPI.util.openExternal(url).then(() => setContextMenu(null))
    } else {
      window.open(url, '_blank')
      setContextMenu(null)
    }
  }

  const handleDownload = async () => {
    if (!window.electronAPI?.util?.saveImage) return
    const ext = url.match(/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i)?.[1]?.toLowerCase() || 'png'
    const name = `image-${Date.now()}.${ext.replace('jpeg', 'jpg')}`
    const res = await window.electronAPI.util.saveImage(url, name)
    if (!res.success && !res.canceled) console.error('保存图片失败:', res.error)
    setContextMenu(null)
  }

  return (
    <div className="relative mt-1.5 group">
      <button
        onClick={() => setExpanded(v => !v)}
        onContextMenu={handleContextMenu}
        className="block w-full text-left"
        title={expanded ? '点击收起' : '点击展开查看完整图片'}
      >
        <img
          src={dataUrl}
          alt="result image"
          className={cn(
            'rounded-md border border-border/40 w-full object-cover object-top transition-all duration-200',
            expanded ? 'max-h-none' : 'max-h-52'
          )}
          onError={() => setError('图片加载失败')}
        />
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-linear-to-t from-[#0d0d0d] to-transparent rounded-b-md flex items-end justify-center pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground/60 bg-black/40 px-2 py-0.5 rounded">展开</span>
          </div>
        )}
      </button>
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[9999] py-1 bg-background border border-border rounded-lg shadow-lg min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={handleDownload}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
          >
            下载
          </button>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
          >
            复制 URL
          </button>
          {isRemote && (
            <button
              type="button"
              onClick={handleOpenInBrowser}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50"
            >
              在浏览器打开
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 思考内容展示 ----

function ThinkingBlockDisplay({ content }: { content: string }) {
  return (
    <div className="text-xs text-muted-foreground/55 italic leading-relaxed py-1.5 pl-3 pr-2 border-l-3 border-l-muted-foreground/30">
      {content}
    </div>
  )
}

// ---- 工具调用卡片 ----

/** 从 tool-display 配置中解析 tool_call 的字段映射（支持嵌套 tool_call 或扁平兼容） */
function getToolCallFieldMap(): Record<string, string> | undefined {
  const cfg = (toolDisplayConfig as { toolSingleArgField?: Record<string, unknown> }).toolSingleArgField
  if (!cfg || typeof cfg !== 'object') return undefined
  if ('tool_call' in cfg && cfg.tool_call && typeof cfg.tool_call === 'object') {
    return cfg.tool_call as Record<string, string>
  }
  return cfg as Record<string, string>
}

/** 从 tool-display 配置中解析 tool_result 的字段映射 */
function getToolResultFieldMap(): Record<string, string> | undefined {
  const cfg = (toolDisplayConfig as { toolSingleArgField?: Record<string, unknown> }).toolSingleArgField
  if (!cfg || typeof cfg !== 'object') return undefined
  if ('tool_result' in cfg && cfg.tool_result && typeof cfg.tool_result === 'object') {
    return cfg.tool_result as Record<string, string>
  }
  return undefined
}

function ToolCallCard({ block }: { block: ToolCallBlock }) {
  const [open, setOpen] = useState(false)
  const hasImages = block.images.length > 0

  const singleStringArg = (() => {
    const fieldMap = getToolCallFieldMap()
    const field = fieldMap?.[block.name] ?? fieldMap?.['__default__']
    if (field && typeof block.args[field] === 'string') return block.args[field] as string
    const argValues = Object.values(block.args)
    return argValues.length === 1 && typeof argValues[0] === 'string' ? String(argValues[0]) : null
  })()

  return (
    <div className="rounded-lg border border-border/60 bg-[#111] overflow-hidden text-xs my-1.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors text-left"
      >
        <Wrench className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        <span className="text-orange-300 font-mono font-medium">{block.name}</span>
        {singleStringArg && (
          <span className="text-muted-foreground/70 truncate flex-1">
            {singleStringArg.length > 60 ? singleStringArg.slice(0, 60) + '…' : singleStringArg}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground/50">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40 bg-[#0d0d0d] px-3 py-2">
          <pre className="text-muted-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(block.args, null, 2)}
          </pre>
        </div>
      )}
      {hasImages && (
        <div className="border-t border-border/40 px-3 py-2 space-y-1.5">
          {block.images.map((imgUrl, i) => (
            <ImagePreview key={i} url={imgUrl} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- 工具结果卡片 ----

function ToolResultCard({ block, toolName }: { block: ToolResultBlock; toolName?: string }) {
  const [open, setOpen] = useState(false)
  const hasImages = block.images.length > 0

  // 与 tool_call 一致：配置的字段在工具名后面显示
  const singleStringArg = (() => {
    if (!toolName) return null
    const fieldMap = getToolResultFieldMap()
    const field = fieldMap?.[toolName] ?? fieldMap?.['__default__']
    if (!field) return null
    try {
      const parsed = JSON.parse(block.content) as Record<string, unknown>
      const val = parsed[field]
      return typeof val === 'string' ? val : null
    } catch { return null }
  })()

  const fallbackPreview = block.title || block.content.replace(/\n/g, ' ').slice(0, 80)
  const hasMoreText = !block.title && block.content.length > 80

  return (
    <div className="rounded-lg border border-border/40 bg-[#0d0d0d] overflow-hidden text-xs my-1.5">
      {/* 标题行：与 tool_call 一致，工具名 + 配置字段 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <FileText className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" />
        {toolName ? (
          <>
            <span className="text-emerald-400/90 font-mono font-medium shrink-0">{toolName}</span>
            {singleStringArg && (
              <span className="text-muted-foreground/70 truncate flex-1">
                {singleStringArg.length > 60 ? singleStringArg.slice(0, 60) + '…' : singleStringArg}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/60 truncate flex-1">
            {fallbackPreview}{hasMoreText && !open ? '…' : ''}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground/40">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>

      {/* 展开后的文字详情（在上） */}
      {open && (
        <div className="border-t border-border/30 px-3 py-2">
          <pre className="text-muted-foreground/60 whitespace-pre-wrap break-all leading-relaxed max-h-60 overflow-y-auto scrollbar-thin">
            {block.content}
          </pre>
        </div>
      )}

      {/* 图片区：在展开内容下方，避免错误提示夹在标题与 JSON 中间 */}
      {hasImages && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {block.images.map((imgUrl, i) => (
            <ImagePreview key={i} url={imgUrl} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- 主组件 ----

interface MessageContentProps {
  content: string
  streaming?: boolean
  isLast?: boolean
}

function MessageContentInner({ content, streaming, isLast }: MessageContentProps) {
  let blocks: MessageBlock[]
  try {
    blocks = parseMessageBlocks(content || '')
  } catch (err) {
    console.error('[MessageContent] parseMessageBlocks 失败:', err)
    blocks = [{ type: 'text', content: String(content || '') }]
  }

  let lastToolName: string | undefined
  return (
    <div className="space-y-0.5 min-w-0 overflow-hidden">
      {blocks.map((block, i) => {
        if (block.type === 'thinking') {
          return <ThinkingBlockDisplay key={i} content={block.content} />
        }
        if (block.type === 'tool_call') {
          lastToolName = block.name
          return <ToolCallCard key={i} block={block} />
        }
        if (block.type === 'tool_result') {
          const name = lastToolName
          lastToolName = undefined
          return <ToolResultCard key={i} block={block} toolName={name} />
        }
        return (
          <div key={i} className="space-y-2 min-w-0 overflow-hidden">
            <div
              className={cn(
                'prose prose-sm prose-invert max-w-none text-sm leading-relaxed wrap-break-word',
                'prose-p:my-2 prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-border',
                'prose-pre:rounded-lg prose-pre:break-all prose-code:text-orange-300 prose-code:before:content-none',
                'prose-code:after:content-none prose-headings:text-foreground prose-a:text-primary prose-a:break-all',
                'prose-strong:text-foreground prose-li:my-0.5 [&_p]:wrap-break-word'
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {block.content}
              </ReactMarkdown>
              {streaming && isLast && i === blocks.length - 1 && (
                <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
            {block.inlineImages && block.inlineImages.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {block.inlineImages.map((imgUrl, j) => (
                  <ImagePreview key={j} url={imgUrl} />
                ))}
              </div>
            )}
          </div>
        )
      })}
      {streaming && isLast && blocks.length > 0 && blocks[blocks.length - 1].type !== 'text' && (
        <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  )
}

export default memo(MessageContentInner)
