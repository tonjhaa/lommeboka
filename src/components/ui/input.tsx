import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const inputClass = (error: string | undefined, className: string | undefined) =>
  cn(
    'flex h-10 w-full rounded-md border bg-input px-3 py-2 text-sm text-foreground',
    'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
    'placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-destructive focus-visible:ring-destructive' : 'border-border',
    className,
  )

// Numeric variant: uses text+inputMode="decimal" internally so commas work,
// raw string state so "0" is replaceable and "12." doesn't snap back to "12".
function NumericInput({ value, onChange, onBlur, onFocus, error, className, ...props }: InputProps) {
  const [str, setStr] = React.useState(() => (value != null && value !== '' ? String(value) : ''))

  // Sync from outside only when not focused
  const focused = React.useRef(false)
  React.useEffect(() => {
    if (!focused.current) setStr(value != null && value !== '' ? String(value) : '')
  }, [value])

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = true
    e.currentTarget.select()
    onFocus?.(e)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setStr(raw)
    // Fire synthetic event with normalized value so callers work with parseFloat
    const normalized = raw.replace(/\s/g, '').replace(',', '.')
    const synth = Object.create(e) as React.ChangeEvent<HTMLInputElement>
    Object.defineProperty(synth, 'target', {
      value: { ...e.target, value: normalized },
      writable: false,
    })
    onChange?.(synth)
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    focused.current = false
    // Normalize comma → period on blur for display
    const normalized = str.replace(/\s/g, '').replace(',', '.')
    const parsed = parseFloat(normalized)
    if (!isNaN(parsed)) setStr(String(parsed))
    else if (str !== '' && str !== '-') setStr('')
    onBlur?.(e)
  }

  return (
    <div className="w-full">
      <input
        {...props}
        type="text"
        inputMode="decimal"
        value={str}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        className={inputClass(error, className)}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onFocus, error, ...props }, ref) => {
    if (type === 'number') {
      // forwardRef ref not used for NumericInput (uncontrolled-ish)
      return <NumericInput type={type} onFocus={onFocus} error={error} className={className} {...props} />
    }
    return (
      <div className="w-full">
        <input
          type={type}
          className={inputClass(error, className)}
          ref={ref}
          onFocus={(e) => {
            if (type === 'text') e.currentTarget.select()
            onFocus?.(e)
          }}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
