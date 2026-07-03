import * as React from 'react'
import { cn } from '@/lib/utils'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  prefix?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  error?: string
  /** Tusenskilletegn i visning (default true). Slå av for årstall o.l. */
  grouping?: boolean
}

/**
 * Tallinput med norsk formattering.
 * Viser "4 500 000 kr" når ikke fokusert, aksepterer rå tall ved fokus.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  prefix,
  placeholder,
  className,
  disabled,
  id,
  error,
  grouping = true,
}: NumberInputProps) {
  const [focused, setFocused] = React.useState(false)
  const toRaw = (v: number) => (v === 0 ? '' : v.toString())
  const [rawValue, setRawValue] = React.useState(() => toRaw(value))

  React.useEffect(() => {
    if (!focused) {
      setRawValue(toRaw(value))
    }
  }, [value, focused])

  const formatted = React.useMemo(() => {
    if (value === 0 && placeholder) return ''
    if (!grouping) return String(value)
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(value)
  }, [value, placeholder, grouping])

  function handleFocus() {
    setFocused(true)
    setRawValue(toRaw(value))
  }

  function handleBlur() {
    setFocused(false)
    const cleaned = rawValue.replace(/\s/g, '').replace(',', '.')
    const parsed = parseFloat(cleaned)
    if (!isNaN(parsed)) {
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed
      const clampedMax = max !== undefined ? Math.min(max, clamped) : clamped
      onChange(clampedMax)
    } else {
      onChange(value)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRawValue(e.target.value)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(value + step, max ?? Infinity))
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(value - step, min ?? -Infinity))
    }
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-muted-foreground select-none">{prefix}</span>
        )}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder ?? '0'}
          value={focused ? rawValue : formatted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex h-10 w-full rounded-md border bg-input px-3 py-2 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-destructive focus-visible:ring-destructive' : 'border-border',
            prefix && 'pl-7',
            suffix && 'pr-10',
            className
          )}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-muted-foreground select-none pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
