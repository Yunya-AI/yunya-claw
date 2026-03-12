import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  disabled?: boolean
  placeholder?: string
  className?: string
  /** 全宽模式，用于表单中独占一行的下拉框 */
  fullWidth?: boolean
}

function Select<T extends string = string>({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  className,
  fullWidth,
}: SelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener("click", onDocClick)
      return () => document.removeEventListener("click", onDocClick)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const display = selected?.label ?? placeholder ?? ""

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors",
          fullWidth ? "w-full" : "min-w-[120px] max-w-[180px] flex-1",
          "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className="truncate">{display}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-full rounded-md border border-border bg-secondary py-1 text-foreground shadow-md"
          role="listbox"
        >
          {options.map(opt => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value as T)
                setOpen(false)
              }}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm transition-colors",
                opt.value === value
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/70 hover:text-accent-foreground"
              )}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { Select }
