import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/** 捕获子组件渲染错误，避免整个应用白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
          <p className="text-sm font-medium text-destructive mb-2">加载失败</p>
          <p className="text-xs max-w-md break-all mb-4">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
