import { useState, useMemo } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X, Share2 } from 'lucide-react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import type { IVFTransactionType } from '@/types/economy'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------
// HJELPERE
// ------------------------------------------------------------

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('no-NO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const TYPE_LABELS: Record<IVFTransactionType, string> = {
  SPARING: 'Sparing',
  SVEA: 'SVEA',
  KJØP: 'Kjøp',
  FAKTURA: 'Faktura',
  FAKTURA_DONOR: 'Faktura donor',
  ANNET: 'Annet',
}

const TYPE_COLORS: Record<IVFTransactionType, string> = {
  SPARING: 'text-emerald-400',
  SVEA: 'text-red-400',
  KJØP: 'text-orange-400',
  FAKTURA: 'text-red-300',
  FAKTURA_DONOR: 'text-pink-400',
  ANNET: 'text-sky-400',
}

// ------------------------------------------------------------
// DATA-HOOK — velger delt prosjekt om tilkoblet, ellers personlig
// ------------------------------------------------------------

type IVFTx = { id: string; date: string; label: string; type: IVFTransactionType; amount: number; merknad?: string }

function useIVFData() {
  const shared = useSharedProjectStore()
  const personalTxs = useActiveEconomyStore((s) => s.ivfTransactions)
  const addPersonal = useActiveEconomyStore((s) => s.addIvfTransaction)
  const updatePersonal = useActiveEconomyStore((s) => s.updateIvfTransaction)
  const removePersonal = useActiveEconomyStore((s) => s.removeIvfTransaction)
  const isShared = shared.partnershipId !== null

  // Bruk delt data kun etter at migrering er gjort ELLER delt tabell allerede har innhold
  const sharedHasData = shared.transactions.length > 0 || shared.migrated
  const useShared = isShared && sharedHasData

  return {
    transactions: useShared ? shared.transactions : personalTxs,
    isShared,
    loading: isShared ? shared.loading : false,
    addTransaction: (tx: IVFTx) =>
      useShared ? shared.addTransaction(tx) : addPersonal(tx),
    updateTransaction: (id: string, updates: Partial<IVFTx>) =>
      useShared ? shared.updateTransaction(id, updates) : updatePersonal(id, updates),
    removeTransaction: (id: string) =>
      useShared ? shared.removeTransaction(id) : removePersonal(id),
    personalTxs,
    migrated: shared.migrated,
    migrateFrom: shared.migrateFrom,
  }
}

// ------------------------------------------------------------
// KOSTNADSSTATISTIKK
// ------------------------------------------------------------

function StatsCard() {
  const { transactions: ivfTransactions } = useIVFData()
  const today = new Date().toISOString().split('T')[0]

  function calcStats(txs: typeof ivfTransactions) {
    const sumSpart = txs.filter((t) => t.type === 'SPARING').reduce((s, t) => s + t.amount, 0)
    const medisin = txs
      .filter((t) => t.type === 'KJØP' && t.label.toLowerCase().includes('medisin'))
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const andreKjop = txs
      .filter((t) => t.type === 'KJØP' && !t.label.toLowerCase().includes('medisin'))
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const svea = txs.filter((t) => t.type === 'SVEA').reduce((s, t) => s + Math.abs(t.amount), 0)
    const sveaCount = txs.filter((t) => t.type === 'SVEA').length
    const donorFaktura = txs.filter((t) => t.type === 'FAKTURA_DONOR').reduce((s, t) => s + Math.abs(t.amount), 0)
    const andreFakturaer = txs.filter((t) => t.type === 'FAKTURA').reduce((s, t) => s + Math.abs(t.amount), 0)
    const annet = txs.filter((t) => t.type === 'ANNET').reduce((s, t) => s + Math.abs(t.amount), 0)
    const sumUtgifter = medisin + andreKjop + svea + donorFaktura + andreFakturaer + annet
    return { sumSpart, medisin, andreKjop, svea, sveaCount, donorFaktura, andreFakturaer, annet, sumUtgifter }
  }

  const past = calcStats(ivfTransactions.filter((t) => t.date <= today))
  const all = calcStats(ivfTransactions)

  function Section({
    label,
    stats,
    dim,
  }: {
    label: string
    stats: ReturnType<typeof calcStats>
    dim?: boolean
  }) {
    return (
      <div className={cn('flex flex-col gap-1.5', dim && 'opacity-70')}>
        <div className={cn(
          'text-sm font-bold px-2 py-1 rounded',
          dim
            ? 'bg-muted/30 text-muted-foreground'
            : 'bg-violet-500/15 text-violet-300'
        )}>
          {label}
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-muted-foreground">Sum spart</span>
          <span className="text-sm font-bold text-emerald-400">{fmt(stats.sumSpart)} kr</span>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-medium text-foreground">Sum utgifter</span>
            <span className="text-sm font-bold text-red-400">{fmt(stats.sumUtgifter, 2)} kr</span>
          </div>
          {stats.medisin > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">Medisin</span>
              <span className="text-xs tabular-nums text-orange-400">{fmt(stats.medisin, 2)} kr</span>
            </div>
          )}
          {stats.andreKjop > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">Andre kjøp</span>
              <span className="text-xs tabular-nums text-orange-400">{fmt(stats.andreKjop, 2)} kr</span>
            </div>
          )}
          {stats.donorFaktura > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">Donor faktura</span>
              <span className="text-xs tabular-nums text-pink-400">{fmt(stats.donorFaktura, 2)} kr</span>
            </div>
          )}
          {stats.svea > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">
                SVEA
                <span className="block text-[10px] opacity-60">{stats.sveaCount} betaling{stats.sveaCount !== 1 ? 'er' : ''}</span>
              </span>
              <span className="text-xs tabular-nums text-red-400">{fmt(stats.svea, 2)} kr</span>
            </div>
          )}
          {stats.andreFakturaer > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">Fakturaer</span>
              <span className="text-xs tabular-nums text-red-300">{fmt(stats.andreFakturaer, 2)} kr</span>
            </div>
          )}
          {stats.annet > 0 && (
            <div className="flex justify-between items-baseline pl-3">
              <span className="text-xs text-muted-foreground">Annet</span>
              <span className="text-xs tabular-nums text-sky-400">{fmt(stats.annet, 2)} kr</span>
            </div>
          )}
        </div>
        <div className="flex justify-between items-baseline border-t border-border pt-1.5">
          <span className="text-xs text-muted-foreground">Netto spart</span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              stats.sumSpart - stats.sumUtgifter >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {fmt(stats.sumSpart - stats.sumUtgifter, 2)} kr
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">Oversikt</h3>
      <Section label="Hittil i år" stats={past} />
      <div className="border-t border-border" />
      <Section label="Tilsammen (inkl. planlagt)" stats={all} dim />
    </div>
  )
}

// ------------------------------------------------------------
// INLINE EDIT RAD
// ------------------------------------------------------------

function EditRow({
  tx,
  onSave,
  onCancel,
}: {
  tx: { id: string; date: string; label: string; type: IVFTransactionType; amount: number; merknad?: string }
  onSave: (updates: Partial<typeof tx>) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(tx.date)
  const [label, setLabel] = useState(tx.label)
  const [type, setType] = useState<IVFTransactionType>(tx.type)
  const [amount, setAmount] = useState(String(tx.amount))
  const [merknad, setMerknad] = useState(tx.merknad ?? '')

  function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (!label || isNaN(parsed)) return
    onSave({ date, label, type, amount: parsed, merknad: merknad || undefined })
  }

  return (
    <>
      <td className="px-1 py-1">
        <input
          type="date"
          className="w-28 bg-background border border-border rounded px-1 py-0.5 text-xs"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          className="w-full bg-background border border-border rounded px-1 py-0.5 text-xs"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="text"
          className="w-full mt-0.5 bg-background border border-border rounded px-1 py-0.5 text-[10px] text-muted-foreground"
          value={merknad}
          onChange={(e) => setMerknad(e.target.value)}
          placeholder="Merknad…"
        />
      </td>
      <td className="px-1 py-1">
        <select
          className="bg-background border border-border rounded px-1 py-0.5 text-xs"
          value={type}
          onChange={(e) => setType(e.target.value as IVFTransactionType)}
        >
          {(Object.keys(TYPE_LABELS) as IVFTransactionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          className="w-24 bg-background border border-border rounded px-1 py-0.5 text-xs text-right"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </td>
      <td className="px-1 py-1 text-right text-xs text-muted-foreground">—</td>
      <td className="px-1 py-1">
        <div className="flex gap-1">
          <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-300">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </>
  )
}

// ------------------------------------------------------------
// LEGG TIL TRANSAKSJON
// ------------------------------------------------------------

function AddTransactionForm({ onClose }: { onClose: () => void }) {
  const { addTransaction } = useIVFData()
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<IVFTransactionType>('SPARING')
  const [amount, setAmount] = useState('')
  const [merknad, setMerknad] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (!label || isNaN(parsedAmount)) return
    addTransaction({
      id: crypto.randomUUID(),
      date,
      label,
      type,
      amount: parsedAmount,
      merknad: merknad || undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="text-sm font-semibold text-foreground">Ny transaksjon</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Dato</label>
          <input
            type="date"
            className="bg-background border border-border rounded px-2 py-1 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            className="bg-background border border-border rounded px-2 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as IVFTransactionType)}
          >
            {(Object.keys(TYPE_LABELS) as IVFTransactionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Beskrivelse</label>
        <input
          type="text"
          className="bg-background border border-border rounded px-2 py-1 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="f.eks. Sparing Tonje"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Beløp (negativt = utgift)</label>
          <input
            type="number"
            step="0.01"
            className="bg-background border border-border rounded px-2 py-1 text-sm text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Merknad (valgfritt)</label>
          <input
            type="text"
            className="bg-background border border-border rounded px-2 py-1 text-sm"
            value={merknad}
            onChange={(e) => setMerknad(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
        >
          Legg til
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
        >
          Avbryt
        </button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------
// TRANSAKSJONSTABELL
// ------------------------------------------------------------

function TransactionTable() {
  const { transactions: ivfTransactions, updateTransaction: updateIvfTransaction, removeTransaction: removeIvfTransaction } = useIVFData()
  const [showAll, setShowAll] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...ivfTransactions].sort((a, b) => a.date.localeCompare(b.date)),
    [ivfTransactions]
  )

  const withBalance = useMemo(() => {
    let running = 0
    return sorted.map((t) => {
      running += t.amount
      return { ...t, saldo: running }
    })
  }, [sorted])

  const today = new Date().toISOString().split('T')[0]
  const past = withBalance.filter((t) => t.date <= today)
  const future = withBalance.filter((t) => t.date > today)
  const displayed = showAll ? withBalance : past

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Dato</th>
              <th className="text-left px-3 py-2 font-medium">Beskrivelse</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-right px-3 py-2 font-medium">Beløp</th>
              <th className="text-right px-3 py-2 font-medium">Saldo</th>
              <th className="px-2 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((t) => (
              <tr
                key={t.id}
                className={cn(
                  'border-b border-border/50 hover:bg-muted/30 transition-colors group',
                  t.date > today && 'opacity-50'
                )}
              >
                {editId === t.id ? (
                  <EditRow
                    tx={t}
                    onSave={(updates) => {
                      updateIvfTransaction(t.id, updates)
                      setEditId(null)
                    }}
                    onCancel={() => setEditId(null)}
                  />
                ) : (
                  <>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtDate(t.date)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span>{t.label}</span>
                      {t.merknad && (
                        <span className="block text-muted-foreground/70 text-[10px] leading-tight">
                          {t.merknad}
                        </span>
                      )}
                    </td>
                    <td className={cn('px-3 py-1.5 font-medium', TYPE_COLORS[t.type])}>
                      {TYPE_LABELS[t.type]}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5 tabular-nums text-right',
                        t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {t.amount >= 0 ? '+' : ''}{fmt(t.amount, 2)}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-right text-foreground">
                      {fmt(t.saldo, 2)}
                    </td>
                    <td className="px-2 py-1.5">
                      {confirmDelete === t.id ? (
                        <div className="flex gap-1 items-center">
                          <button
                            onClick={() => { removeIvfTransaction(t.id); setConfirmDelete(null) }}
                            className="text-red-400 hover:text-red-300 text-[10px]"
                          >
                            Ja
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-muted-foreground hover:text-foreground text-[10px]"
                          >
                            Nei
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditId(t.id); setConfirmDelete(null) }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(t.id)}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {future.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2 border-t border-border hover:bg-muted/30 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Skjul planlagte ({future.length})
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Vis planlagte ({future.length})
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// SAMMENDRAG-STATS TOPP
// ------------------------------------------------------------

function SummaryStats() {
  const { transactions: ivfTransactions } = useIVFData()
  const today = new Date().toISOString().split('T')[0]

  const pastTx = ivfTransactions.filter((t) => t.date <= today)
  const saldo = pastTx.reduce((s, t) => s + t.amount, 0)
  const sumSpart = pastTx.filter((t) => t.type === 'SPARING').reduce((s, t) => s + t.amount, 0)
  const UTGIFT_TYPES: IVFTransactionType[] = ['SVEA', 'KJØP', 'FAKTURA', 'FAKTURA_DONOR', 'ANNET']
  const sumUtgifter = pastTx
    .filter((t) => UTGIFT_TYPES.includes(t.type))
    .reduce((s, t) => s + t.amount, 0)

  const cards = [
    { label: 'Saldo (hittil)', value: saldo, color: 'text-emerald-400', decimals: 2 },
    { label: 'Sum spart', value: sumSpart, color: 'text-sky-400', decimals: 0 },
    { label: 'Sum utgifter', value: Math.abs(sumUtgifter), color: 'text-red-400', decimals: 2 },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(({ label, value, color, decimals }) => (
        <div key={label} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn('text-lg font-bold tabular-nums', color)}>
            {fmt(value, decimals)} kr
          </span>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// SIDE
// ------------------------------------------------------------

export function IVFPage() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const { ivfSettings, setIvfSettings } = useEconomyStore()
  const { isShared, personalTxs, migrated, migrateFrom } = useIVFData()
  const needsMigration = isShared && personalTxs.length > 0 && !migrated

  async function handleMigrate() {
    setMigrating(true)
    try {
      await migrateFrom(personalTxs)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Prosjekt</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Mitt navn i transaksjoner:</span>
            <input
              type="text"
              className="h-7 w-24 text-xs rounded border border-border bg-background px-2"
              placeholder="f.eks. Tonje"
              value={ivfSettings?.selfLabel ?? ''}
              onChange={(e) => {
                setIvfSettings({ selfLabel: e.target.value || undefined })
                setNameSaved(false)
              }}
              onBlur={() => {
                if (ivfSettings?.selfLabel) {
                  setNameSaved(true)
                  setTimeout(() => setNameSaved(false), 2500)
                }
              }}
            />
            {nameSaved && (
              <span className="text-[10px] text-green-500">Lagret ✓</span>
            )}
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ny transaksjon
            </button>
          )}
        </div>
      </div>

      {needsMigration && (
        <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-violet-300 flex items-center gap-1.5">
              <Share2 className="h-4 w-4" />
              Del Tonjes data med Ane
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {personalTxs.length} transaksjoner er klare til å flyttes til det felles prosjektet.
            </p>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {migrating ? 'Flytter…' : 'Flytt til felles'}
          </button>
        </div>
      )}

      <SummaryStats />

      {showAddForm && <AddTransactionForm onClose={() => setShowAddForm(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TransactionTable />
        </div>
        <div>
          <StatsCard />
        </div>
      </div>
    </div>
  )
}
