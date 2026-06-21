# Auto-hent nøkkeltall Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-demand-henting av grunnbeløpet fra NAVs offisielle JSON-API inn i nøkkeltall-registeret, med bekreftelse av bruker før skriving — via samme `setKeyFigureOverride` som manuell redigering.

**Architecture:** Tynn Vercel serverless-proxy (`api/key-figure-source.ts`) med URL-allowlist henter NAV-API server-side (CSP krever proxy). Den testbare valideringen/normaliseringen (robusthet mot formatendring) ligger i en ren frontend-tjeneste (`keyFigureFetchService.ts`) med mock-fetch-tester. UI-knapp i Innstillinger viser forslag vs din verdi → bruker bekrefter → skriver override med virkningsår utledet fra NAVs `dato`.

**Tech Stack:** React 19 + TypeScript (strict), Vercel serverless (@vercel/node), Vitest, Zustand.

**Spec:** `docs/superpowers/specs/2026-06-21-auto-hent-nokkeltall-design.md`
**Branch:** `feat/auto-hent-nokkeltall`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test`; spesifikk: `npm test -- <navn>`.
- Conventional commits. Avslutt med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte fakta (mot faktisk kode):**
- `@vercel/node ^5.8.12` i package.json.
- Eksisterende serverless-mønster (`api/scrape-product.ts`): `import type { VercelRequest, VercelResponse } from '@vercel/node'`, `export default async function handler(req, res)`, `req.query`, `res.status(N).json(...)`. Selvstendige (ingen src/-import).
- Frontend kaller `fetch('/api/...')` (se `BabyShoppingPage.tsx`).
- NAV-API: `GET https://g.nav.no/api/v1/grunnbeloep` → `{ grunnbeloep: 136549, dato: "2026-05-01", ... }`.
- Registeret: `setKeyFigureOverride(o: KeyFigureOverride)` finnes på `useEconomyStore`; `KeyFigureKey`/`KeyFigureOverride` i `@/types/economy`; `resolveScalar` i `@/domain/economy/keyFigureRegistry`.
- `KeyFigureSection` ligger i `src/pages/economy/EconomySettingsPage.tsx` (skalar-rader med Endre/Tilbakestill + historikk-details).

---

### Task 1: Frontend-tjeneste `keyFigureFetchService` (testbar normalisering)

**Files:**
- Create: `src/domain/economy/keyFigureFetchService.ts`
- Test: `src/domain/economy/__tests__/keyFigureFetchService.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/keyFigureFetchService.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchKeyFigure, isFetchable } from '../keyFigureFetchService'

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('isFetchable', () => {
  it('grunnbelop har auto-hent-kilde', () => { expect(isFetchable('grunnbelop')).toBe(true) })
  it('feriepengerProsent har ikke', () => { expect(isFetchable('feriepengerProsent')).toBe(false) })
})

describe('fetchKeyFigure(grunnbelop)', () => {
  it('gyldig NAV-respons → normalisert med år utledet fra dato', async () => {
    mockFetchOnce(200, { grunnbeloep: 136549, dato: '2026-05-01' })
    const r = await fetchKeyFigure('grunnbelop')
    expect(r).toEqual({
      key: 'grunnbelop', value: 136549, effectiveDate: '2026-05-01',
      effectiveYear: 2026, source: 'g.nav.no/api/v1/grunnbeloep',
    })
  })

  it('manglende grunnbeloep → error, ingen verdi', async () => {
    mockFetchOnce(200, { dato: '2026-05-01' })
    const r = await fetchKeyFigure('grunnbelop')
    expect('error' in r).toBe(true)
  })

  it('feil type grunnbeloep → error', async () => {
    mockFetchOnce(200, { grunnbeloep: 'mye', dato: '2026-05-01' })
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ugyldig dato-form → error', async () => {
    mockFetchOnce(200, { grunnbeloep: 136549, dato: '01.05.2026' })
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ikke-200 → error', async () => {
    mockFetchOnce(502, {})
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('fetch kaster (nettverk/timeout) → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ukjent key → error uten å kalle fetch', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    // @ts-expect-error bevisst ugyldig key
    const r = await fetchKeyFigure('finnesikke')
    expect('error' in r).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- keyFigureFetchService`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 3: Implementer tjenesten**

Create `src/domain/economy/keyFigureFetchService.ts`:

```ts
// ============================================================
// AUTO-HENT — henter ferske nøkkeltall fra offentlig kilde via serverless-proxy.
// All validering/normalisering (robusthet mot formatendring) ligger her og er
// enhetstestet. Ved enhver tvil returneres { error } — aldri en upålitelig verdi.
// ============================================================

import type { KeyFigureKey } from '@/types/economy'

export interface FetchedKeyFigure {
  key: KeyFigureKey
  value: number
  effectiveDate: string   // "YYYY-MM-DD" fra kilden
  effectiveYear: number   // utledet av effectiveDate (virkningsår)
  source: string
}

export type FetchKeyFigureResult = FetchedKeyFigure | { error: string }

/** Per-key normalisering av rå kilde-JSON. null = uventet form (ikke skriv). */
const FETCH_SOURCES: Partial<Record<KeyFigureKey, {
  sourceLabel: string
  normalize: (json: unknown) => { value: number; effectiveDate: string } | null
}>> = {
  grunnbelop: {
    sourceLabel: 'g.nav.no/api/v1/grunnbeloep',
    normalize: (j) => {
      const o = j as { grunnbeloep?: unknown; dato?: unknown }
      if (typeof o.grunnbeloep !== 'number' || !isFinite(o.grunnbeloep) || o.grunnbeloep <= 0) return null
      if (typeof o.dato !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.dato)) return null
      return { value: o.grunnbeloep, effectiveDate: o.dato }
    },
  },
}

export function isFetchable(key: KeyFigureKey): boolean {
  return key in FETCH_SOURCES
}

export async function fetchKeyFigure(key: KeyFigureKey): Promise<FetchKeyFigureResult> {
  const src = FETCH_SOURCES[key]
  if (!src) return { error: 'Ukjent kilde' }
  try {
    const res = await fetch(`/api/key-figure-source?source=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { error: 'Kunne ikke hente fra NAV nå — prøv igjen senere' }
    const json = await res.json()
    const norm = src.normalize(json)
    if (!norm) return { error: 'Uventet svar fra NAV — sjekk verdien manuelt på nav.no' }
    return {
      key,
      value: norm.value,
      effectiveDate: norm.effectiveDate,
      effectiveYear: parseInt(norm.effectiveDate.slice(0, 4), 10),
      source: src.sourceLabel,
    }
  } catch {
    return { error: 'Kunne ikke hente fra NAV nå — prøv igjen senere' }
  }
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- keyFigureFetchService && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/keyFigureFetchService.ts src/domain/economy/__tests__/keyFigureFetchService.test.ts
git commit -m "feat(auto-hent): keyFigureFetchService med validering + år-utledning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Serverless-proxy `api/key-figure-source.ts`

**Files:**
- Create: `api/key-figure-source.ts`

- [ ] **Step 1: Implementer serverless-funksjonen**

Create `api/key-figure-source.ts` (selvstendig, følger `api/scrape-product.ts`-mønsteret):

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

// URL-allowlist. Brukeren kan KUN velge en nøkkel her — aldri sende vilkårlig URL.
// → SSRF nær null. redirect:'error' som forsvar i dybden (NAV-API-et skal ikke redirecte).
const SOURCE_URLS: Record<string, string> = {
  grunnbelop: 'https://g.nav.no/api/v1/grunnbeloep',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { source } = req.query
  if (typeof source !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCE_URLS, source)) {
    return res.status(400).json({ error: 'Unknown source' })
  }

  try {
    const upstream = await fetch(SOURCE_URLS[source], {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream returned an error' })
    }
    const json = await upstream.json()
    // Cache 1 time på Vercel-edge — G endres sjelden; reduserer last mot NAV.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'Could not fetch source' })
  }
}
```

- [ ] **Step 2: Verifiser typecheck + bygg**

Run: `npm run typecheck && npm run build`
Expected: PASS / rent. (Serverless-funksjoner typecheckes med resten; build rører dem ikke, Vercel bygger dem separat.)

> **Implementeringsnotat:** Det finnes ingen automatiserte tester for serverless-funksjonen (samme som `api/scrape-product.ts` — ingen api/-tester i repoet). All testbar logikk ligger i `keyFigureFetchService` (Task 1). Verifiser manuelt etter deploy: `curl 'https://lommeboka.com/api/key-figure-source?source=grunnbelop'` → NAV-JSON; `?source=tull` → 400.

- [ ] **Step 3: Commit**

```bash
git add api/key-figure-source.ts
git commit -m "feat(auto-hent): serverless-proxy med URL-allowlist for NAV-kilde

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: UI — aktiver «Hent fra NAV»-knapp + bekreftelsesflyt

**Files:**
- Modify: `src/pages/economy/EconomySettingsPage.tsx` (`KeyFigureSection`)

- [ ] **Step 1: Importer tjenesten + legg til state**

Øverst i `EconomySettingsPage.tsx`, legg til import:

```ts
import { fetchKeyFigure, isFetchable, type FetchedKeyFigure } from '@/domain/economy/keyFigureFetchService'
```

I `KeyFigureSection`-komponenten, legg til state etter de eksisterende `useState`-linjene (`editKey`/`editVal`):

```ts
  const [fetching, setFetching] = useState<KeyFigureKey | null>(null)
  const [suggestion, setSuggestion] = useState<FetchedKeyFigure | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function hentFraKilde(k: KeyFigureKey) {
    setFetching(k); setFetchError(null); setSuggestion(null)
    const r = await fetchKeyFigure(k)
    setFetching(null)
    if ('error' in r) { setFetchError(r.error); return }
    setSuggestion(r)
  }

  function bekreftForslag(s: FetchedKeyFigure) {
    setOverride({ key: s.key, year: s.effectiveYear, value: s.value, verifiedAt: new Date().toISOString().split('T')[0], source: s.source })
    setSuggestion(null)
  }
```

- [ ] **Step 2: Legg «Hent fra NAV»-knapp på fetchable skalar-rader**

I skalar-`.map()`, inne i den ikke-redigerende knapp-gruppen (der «Endre»/«Tilbakestill» er), legg til EN knapp KUN for fetchable nøkkeltall — rett før «Endre»-knappen:

```tsx
                    {isFetchable(k) && (
                      <button
                        onClick={() => hentFraKilde(k)}
                        disabled={fetching === k}
                        className="text-[11px] text-primary hover:underline disabled:opacity-50"
                      >
                        {fetching === k ? 'Henter…' : 'Hent fra NAV'}
                      </button>
                    )}
```

- [ ] **Step 3: Legg bekreftelses-/feilrad under skalar-rad-innholdet**

Inne i skalar-radens ytre kort-`<div>` (etter `<div className="flex items-center justify-between gap-2">…</div>` og historikk-`<details>`), legg til forslag-/feilvisning KUN for den aktive raden:

```tsx
              {suggestion?.key === k && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-[11px] text-foreground">
                    NAV: <span className="font-mono">{fmtUnit(suggestion.value, meta.unit)}</span> (gjelder fra {suggestion.effectiveDate}) · din verdi: <span className="font-mono">{fmtUnit(current, meta.unit)}</span>
                  </span>
                  {suggestion.value === current ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Du har allerede siste verdi</span>
                      <button onClick={() => setSuggestion(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Lukk</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => bekreftForslag(suggestion)} className="rounded bg-primary/20 px-2 py-1 text-[11px] text-primary">Bruk</button>
                      <button onClick={() => setSuggestion(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Avbryt</button>
                    </div>
                  )}
                </div>
              )}
              {fetchError && fetching === null && suggestion === null && (
                <p className="mt-2 text-[11px] text-yellow-400">{fetchError}</p>
              )}
```

> **Implementeringsnotat:** `fetchError` vises globalt under sist forsøkte rad — for enkelhets skyld vises den under hver rad der betingelsen holder. For å unngå at feilen dupliseres på alle rader, vis den KUN på raden som ble forsøkt: behold en `errorKey`-state i stedet, ELLER (enklere) vis `fetchError` kun når `isFetchable(k)` OG ingen suggestion. Implementer den enkle varianten: gat feilraden med `isFetchable(k)` slik at den kun kan dukke opp på grunnbelop-raden (eneste fetchable). Bekreft i nettleser at feil vises på riktig rad.

- [ ] **Step 4: Oppdater «auto-hent kommer»-teksten**

Erstatt den eksisterende bunn-teksten i `KeyFigureSection`:

```tsx
        <p className="text-[10px] text-muted-foreground/60">
          Auto-hent fra nav.no/skatteetaten kommer i en senere versjon.
        </p>
```

med:

```tsx
        <p className="text-[10px] text-muted-foreground/60">
          «Hent fra NAV» henter offisielt grunnbeløp fra g.nav.no. Flere kilder kommer senere.
        </p>
```

- [ ] **Step 5: Verifiser bygg + typecheck**

Run: `npm run build && npm run typecheck`
Expected: PASS / rent. Pass på `noUnusedLocals` (alle nye state-variabler brukes).

- [ ] **Step 6: Manuell røyktest**

Run: `npm run dev`, åpne Innstillinger → «Nøkkeltall & satser».
Expected: «Hent fra NAV»-knapp KUN på grunnbeløp-raden. Klikk → «Henter…» → forslag-rad «NAV: 136 549 (gjelder fra 2026-05-01) · din verdi: …». «Bruk» → verdien blir egendefinert (med riktig virkningsår), historikk viser «g.nav.no». «Avbryt» → ingen endring. (Feil-/likt-verdi-stiene kan ikke lett testes lokalt uten mock — verifiseres etter deploy.)

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/EconomySettingsPage.tsx
git commit -m "feat(auto-hent): «Hent fra NAV»-knapp + bekreftelsesflyt i Innstillinger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Sluttverifisering

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. `keyFigureFetchService`-tester grønne; ingen eksisterende tester brutt.

- [ ] **Step 2: Konsistens-sjekk (manuell)**

Run: `npm run dev`. Bekreft:
- «Hent fra NAV» → «Bruk» skriver via `setKeyFigureOverride` → grunnbeløpet på pensjon/formue/scenario/dashbord oppdateres (samme resolver), og «utdatert»-varselet forsvinner.
- «Tilbakestill» (fra fundamentet) fjerner den auto-hentede overriden → faller til kode-default.
- Ingen ny verdi skrives uten at du klikker «Bruk».

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Serverless-proxy med allowlist + redirect:error + timeout (Task 2), testbar validering/normalisering med år-utledning fra `dato` (Task 1), bekreftelsesflyt «forslag vs din verdi → Bruk/Avbryt» + likt-verdi-sti + feilmeldinger (Task 3), skriving KUN via `setKeyFigureOverride` med virkningsår fra NAV (Task 1+3), «auto-hent kommer»-tekst erstattet (Task 3). Feilhåndtering (ukjent source, NAV nede, uventet form, likt verdi, offline) dekket i Task 1-tester + Task 3-UI.
- **Avvik fra spec (bevisst forbedring):** Spec la `parse` server-side; planen legger den testbare normaliseringen i frontend-tjenesten i stedet (serverless er tynn passthrough-proxy). Funksjonelt ekvivalent, men FULLT enhetstestbar (api/-funksjoner har ingen tester i repoet) og robustheten mot formatendring beskytter registeret før skriving. Serverless beholder allowlist + timeout + redirect:error.
- **Placeholders:** Task 1/3 har komplett kode + tester. Task 2 er komplett serverless-kode. Implementeringsnotater presiserer feilrad-plassering (gat med `isFetchable(k)`) og manuell verifisering.
- **Typekonsistens:** `FetchedKeyFigure`/`FetchKeyFigureResult`, `fetchKeyFigure`/`isFetchable`, `KeyFigureKey`/`KeyFigureOverride`, `setKeyFigureOverride`, `effectiveYear`/`effectiveDate`/`source` konsistente på tvers.
- **Konsistens-regel:** auto-hent skriver via samme `setKeyFigureOverride` som manuell redigering → ny G propagerer via resolveren overalt + synkes til partner; ingen sidekanal. Virkningsår fra NAV utnytter år-versjoneringen.
