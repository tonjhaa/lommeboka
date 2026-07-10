import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { SHARING_MODE_LABELS, type CarLoanResult, type SharingMode } from '@/utils/carLoanCalculator'

/** Eierskap og deling av kostnader med partner */
export function SharingSection({ result }: { result: CarLoanResult }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setSharing = useCarLoanCalculatorStore((s) => s.setSharing)

  const { mode, myPct, myFixedAmount } = inputs.sharing
  const sharingActive = mode !== 'alene'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Deling med partner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Hvordan deler dere kostnadene?" help="Deler dere etter bruk, velg prosentvis og sett andelen ut fra hvor mye hver av dere kjører.">
          <Select value={mode} onValueChange={(v) => setSharing({ mode: v as SharingMode })}>
            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SHARING_MODE_LABELS) as SharingMode[]).map((m) => (
                <SelectItem key={m} value={m}>{SHARING_MODE_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {mode === 'prosent' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Min andel</span>
              <span>{myPct} % / partner {100 - myPct} %</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={myPct}
              onChange={(e) => setSharing({ myPct: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        )}

        {mode === 'fastbelop' && (
          <div className="w-44">
            <Field label="Jeg betaler per måned">
              <NumberInput
                value={myFixedAmount}
                onChange={(v) => setSharing({ myFixedAmount: v })}
                suffix="kr" min={0}
              />
            </Field>
          </div>
        )}

        {sharingActive && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Min andel</p>
              <p className="font-mono font-semibold text-lg">{fmtNOK(result.myShareMonthly)}<span className="text-xs font-normal text-muted-foreground">/mnd</span></p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Partners andel</p>
              <p className="font-mono font-semibold text-lg">{fmtNOK(result.partnerShareMonthly)}<span className="text-xs font-normal text-muted-foreground">/mnd</span></p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
