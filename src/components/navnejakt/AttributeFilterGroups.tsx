import { Chip } from './shared'
import {
  LENGTH_LABEL, SYLLABLE_LABEL, toggleIn,
  type AttributeFilters, type LengthBucket, type SyllableBucket,
} from '@/lib/names/filters'

export function FilterGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

/** Forbokstav, lengde og stavelser — felles for swipe-filtrene og «Alle navn». */
export function AttributeFilterGroups({ value, onChange, letters }: {
  value: AttributeFilters; onChange: (patch: Partial<AttributeFilters>) => void; letters: readonly string[]
}) {
  return (
    <>
      <FilterGroup title="Forbokstav">
        {letters.map((l) => (
          <Chip key={l} active={value.letters.includes(l)} onClick={() => onChange({ letters: toggleIn(value.letters, l) })}>
            {l.toLocaleUpperCase('nb')}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Lengde">
        {(Object.keys(LENGTH_LABEL) as LengthBucket[]).map((b) => (
          <Chip key={b} active={value.length.includes(b)} onClick={() => onChange({ length: toggleIn(value.length, b) })}>
            {LENGTH_LABEL[b]}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="Stavelser" hint="Omtrentlig — beregnet fra vokalene i navnet.">
        {(Object.keys(SYLLABLE_LABEL) as SyllableBucket[]).map((b) => (
          <Chip key={b} active={value.syllables.includes(b)} onClick={() => onChange({ syllables: toggleIn(value.syllables, b) })}>
            {SYLLABLE_LABEL[b]}
          </Chip>
        ))}
      </FilterGroup>
    </>
  )
}
