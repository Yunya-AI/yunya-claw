import { useState } from 'react'
import { Info } from 'lucide-react'
import { useAppearance } from '@/contexts/AppearanceContext'

function QrCard({ src, alt, fallback, desc }: { src: string; alt: string; fallback: string; desc: string }) {
  const [loaded, setLoaded] = useState(true)
  return (
    <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/20 shadow-sm hover:bg-muted/30 transition-colors">
      <div className="w-48 h-48 rounded-xl overflow-hidden bg-white/95 flex items-center justify-center shadow-inner">
        {loaded ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-contain"
            onError={() => setLoaded(false)}
          />
        ) : (
          <span className="text-muted-foreground text-sm text-center px-4">{fallback}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">{desc}</p>
    </div>
  )
}

export default function AboutPage() {
  const { appName } = useAppearance()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Info className="w-5 h-5 text-primary" />
          关于
        </h1>

        {/* 介绍 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">介绍</h2>
          <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
            <p>
              {appName} 是一款个人 AI 助手应用，基于 OpenClaw 构建。支持多数字人、人物设定、技能扩展等功能，
              帮助你打造专属的 AI 伙伴。
            </p>
          </div>
        </section>

        {/* 菜单功能 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">菜单功能</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">数字人</span> — 管理多个 AI 数字人，切换对话、新建/删除数字人，配置头像与名称。
            </li>
            <li>
              <span className="font-medium text-foreground">控制台</span> — 查看 Gateway 运行状态、会话列表，管理对话与任务。
            </li>
            <li>
              <span className="font-medium text-foreground">接入</span> — 配置 QQ、飞书等外部平台接入，将 AI 接入到你的群聊或私聊。
            </li>
            <li>
              <span className="font-medium text-foreground">定时</span> — 设置定时任务，让 AI 在指定时间自动执行任务。
            </li>
            <li>
              <span className="font-medium text-foreground">设定</span> — 编辑数字人的系统提示词、人设、身份、工具指南等 Workspace 文件。
            </li>
            <li>
              <span className="font-medium text-foreground">技能</span> — 浏览、安装、管理技能插件，扩展 AI 能力。
            </li>
            <li>
              <span className="font-medium text-foreground">模型</span> — 配置 Provider、默认模型，管理 API 与模型参数。
            </li>
            <li>
              <span className="font-medium text-foreground">设置</span> — 环境变量、应用外观、备份恢复等通用设置。
            </li>
            <li>
              <span className="font-medium text-foreground">关于</span> — 查看应用介绍与作者联系方式。
            </li>
          </ul>
        </section>

        {/* 养虾交流 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">养虾交流</h2>
          <p className="text-sm text-muted-foreground">
            使用过程中如有疑问，可添加作者微信加入「使用交流群」，一起聊聊配置、使用技巧和踩坑经验。
          </p>
        </section>

        {/* 联系方式 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">联系作者</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <QrCard
              src="./wechat-qr.png"
              alt="微信二维码"
              fallback="请将 wechat-qr.png 放入 public 目录"
              desc="扫一扫上面的二维码图案，加我为朋友"
            />
            <QrCard
              src="./qq-qr.png"
              alt="QQ 二维码"
              fallback="请将 qq-qr.png 放入 public 目录"
              desc="扫一扫，加我为好友 · QQ: 732100210"
            />
            <QrCard
              src="./feishu-qr.png"
              alt="飞书二维码"
              fallback="请将 feishu-qr.png 放入 public 目录"
              desc="扫描二维码，添加我为联系人"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-6 text-center">
            powered by <a href="https://agiyiya.com" target="_blank" rel="noopener noreferrer" className="hover:underline">agiyiya.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
