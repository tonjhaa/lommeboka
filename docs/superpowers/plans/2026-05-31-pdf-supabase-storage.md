# PDF-slipper i Supabase Storage — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lagre importerte lønnsslipper (PDF) i Supabase Storage slik at de overlever på tvers av enheter, ikke bare i nettleserens localStorage.

**Architecture:** Nytt lag `src/lib/slipStorage.ts` håndterer all Storage-kommunikasjon. `MonthRecord` får et nytt valgfritt felt `slipStoragePath`. Ved import lastes PDF opp til `payslips/{userId}/{year}-{month}.pdf`. Base64 beholdes som lokal cache. Ved visning av slip: vis lokal kopi, ellers last ned fra Storage. Eksisterende slipper med base64 men uten `slipStoragePath` migreres automatisk etter innlogging.

**Tech Stack:** Supabase Storage JS SDK (`supabase.storage`), eksisterende `src/lib/supabase.ts`, Zustand store

---

## Filer som opprettes / endres

| Fil | Hva |
|-----|-----|
| `src/lib/slipStorage.ts` | NY — upload, download, migrate PDF til/fra Storage |
| `src/types/economy.ts` | Legg til `slipStoragePath?: string` i `MonthRecord` |
| `src/application/useEconomyStore.ts` | `importSlip` kaller `uploadSlipPDF` etter import |
| `src/lib/syncEconomyData.ts` | Strip ikke `slipStoragePath`; kall `migrateLocalPDFs` ved load |
| `src/pages/economy/SalaryPage.tsx` | `SlipViewer` henter PDF fra Storage om base64 mangler |
| Supabase Dashboard (manuelt) | Opprett bucket `payslips` med RLS |

---

## Task 1: Opprett Supabase Storage bucket

**Files:**
- Supabase Dashboard (manuelt steg)

- [ ] **Steg 1: Opprett bucket via Supabase MCP**

Kjør i Claude-sesjonen:
```
mcp__claude_ai_Supabase__execute_sql: project_id=wtgycitlfbbmeivnexsu
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payslips', 'payslips', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Steg 2: Sett RLS-policy for bucket**

```sql
-- Brukere kan lese egne filer
CREATE POLICY "Brukere ser egne slipper"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payslips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Brukere kan laste opp egne filer
CREATE POLICY "Brukere laster opp egne slipper"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payslips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Brukere kan slette egne filer
CREATE POLICY "Brukere sletter egne slipper"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payslips' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Steg 3: Verifiser bucket finnes**

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'payslips';
```
Forventet: én rad med `public = false`.

---

## Task 2: Legg til `slipStoragePath` i typen

**Files:**
- Modify: `src/types/economy.ts:180`

- [ ] **Steg 1: Legg til felt**

Endre:
```typescript
export interface MonthRecord {
  // ... eksisterende felt
  slipPdfBase64?: string               // PDF-fil lagret som base64 (maks 12 slipper)
}
```
Til:
```typescript
export interface MonthRecord {
  // ... eksisterende felt
  slipPdfBase64?: string               // PDF-fil lagret som base64 (lokal cache)
  slipStoragePath?: string             // Supabase Storage-sti: {userId}/{year}-{month}.pdf
}
```

- [ ] **Steg 2: Bygg og sjekk ingen TypeScript-feil**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 3: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(slip-storage): legg til slipStoragePath i MonthRecord"
```

---

## Task 3: Opprett `src/lib/slipStorage.ts`

**Files:**
- Create: `src/lib/slipStorage.ts`

- [ ] **Steg 1: Skriv filen**

```typescript
import { supabase } from './supabase'

const BUCKET = 'payslips'

/** Henter innlogget bruker-ID. Returnerer null om ikke innlogget. */
async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Beregner Storage-sti for en slip: {userId}/{year}-{month}.pdf */
export function slipPath(userId: string, year: number, month: number): string {
  return `${userId}/${year}-${String(month).padStart(2, '0')}.pdf`
}

/**
 * Laster opp en PDF-slip til Supabase Storage.
 * Returnerer storage-stien om vellykket, null ved feil.
 */
export async function uploadSlipPDF(
  year: number,
  month: number,
  pdfBase64: string
): Promise<string | null> {
  const userId = await getUserId()
  if (!userId) return null

  try {
    const path = slipPath(userId, year, month)
    const binary = atob(pdfBase64.replace(/^data:application\/pdf;base64,/, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/pdf',
    })
    if (error) {
      console.error('[slipStorage] upload feil:', error.message)
      return null
    }
    return path
  } catch (e) {
    console.error('[slipStorage] upload exception:', e)
    return null
  }
}

/**
 * Laster ned en PDF fra Supabase Storage og returnerer den som base64-streng.
 * Returnerer null ved feil eller om filen ikke finnes.
 */
export async function downloadSlipPDF(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
    if (error || !data) return null

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(data)
    })
  } catch (e) {
    console.error('[slipStorage] download exception:', e)
    return null
  }
}

/**
 * Migrerer eksisterende slipper med base64 men uten storage-sti til Supabase Storage.
 * Kalles én gang etter innlogging. Oppdaterer storen direkte.
 */
export async function migrateLocalPDFs(
  monthHistory: Array<{ year: number; month: number; slipPdfBase64?: string; slipStoragePath?: string }>,
  updateRecord: (year: number, month: number, storagePath: string) => void
): Promise<void> {
  const userId = await getUserId()
  if (!userId) return

  const toMigrate = monthHistory.filter(
    (m) => m.slipPdfBase64 && !m.slipStoragePath
  )

  for (const m of toMigrate) {
    const path = await uploadSlipPDF(m.year, m.month, m.slipPdfBase64!)
    if (path) {
      updateRecord(m.year, m.month, path)
    }
  }
}
```

- [ ] **Steg 2: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 3: Commit**

```bash
git add src/lib/slipStorage.ts
git commit -m "feat(slip-storage): ny slipStorage.ts for upload/download/migrate"
```

---

## Task 4: Oppdater `importSlip` til å laste opp PDF

**Files:**
- Modify: `src/application/useEconomyStore.ts:345-392`

- [ ] **Steg 1: Finn og oppdater `importSlip`**

Etter `set(...)` i `importSlip`, legg til asynkron upload. Importslip-funksjonen setter `slipStoragePath` i storen etter vellykket upload:

```typescript
importSlip: (slip, pdfBase64) => {
  // ... eksisterende logikk som setter record og kaller set() ...

  // Last opp PDF til Supabase Storage i bakgrunnen (ikke-blokkerende)
  if (pdfBase64) {
    import('@/lib/slipStorage').then(({ uploadSlipPDF }) => {
      uploadSlipPDF(slip.periode.year, slip.periode.month, pdfBase64).then((path) => {
        if (path) {
          set((s) => ({
            monthHistory: s.monthHistory.map((m) =>
              m.year === slip.periode.year && m.month === slip.periode.month
                ? { ...m, slipStoragePath: path }
                : m
            ),
          }))
        }
      })
    })
  }
},
```

- [ ] **Steg 2: Bygg og sjekk**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```

- [ ] **Steg 3: Commit**

```bash
git add src/application/useEconomyStore.ts
git commit -m "feat(slip-storage): importSlip laster opp PDF til Supabase Storage"
```

---

## Task 5: Behold `slipStoragePath` i Supabase-sync; migrer ved innlogging

**Files:**
- Modify: `src/lib/syncEconomyData.ts`

- [ ] **Steg 1: Ikke strip `slipStoragePath` fra payload**

I `saveToSupabase`, endre:
```typescript
const monthHistoryUtenPDF = state.monthHistory.map(({ slipPdfBase64: _, ...rest }) => rest)
```
Til:
```typescript
// Strip lokal PDF-cache (stor), behold storage-referansen
const monthHistoryUtenPDF = state.monthHistory.map(({ slipPdfBase64: _, ...rest }) => rest)
```
(ingen endring i kode — `slipStoragePath` er allerede med i `rest` siden vi bare stripper `slipPdfBase64`)

Verifiser at `slipStoragePath` faktisk er i `rest` ved å sjekke at den ikke er i destructuring.

- [ ] **Steg 2: Kall `migrateLocalPDFs` etter vellykket load**

I `loadFromSupabase`, etter `useEconomyStore.getState().importData(...)`:

```typescript
import { migrateLocalPDFs } from './slipStorage'

// ... etter importData:
useEconomyStore.getState().importData(JSON.stringify(data.economy_data))

// Migrer eventuelle lokale PDF-er til Storage (kjøres bare om noe mangler)
const store = useEconomyStore.getState()
migrateLocalPDFs(store.monthHistory, (year, month, storagePath) => {
  useEconomyStore.setState((s) => ({
    monthHistory: s.monthHistory.map((m) =>
      m.year === year && m.month === month
        ? { ...m, slipStoragePath: storagePath }
        : m
    ),
  }))
})
return true
```

- [ ] **Steg 3: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```

- [ ] **Steg 4: Commit**

```bash
git add src/lib/syncEconomyData.ts
git commit -m "feat(slip-storage): sync slipStoragePath; migrer lokale PDFer ved innlogging"
```

---

## Task 6: Hent PDF fra Storage i SlipViewer

**Files:**
- Modify: `src/pages/economy/SalaryPage.tsx` (SlipViewer / visning av slip)

- [ ] **Steg 1: Finn der slip vises**

Søk etter `slipPdfBase64` eller `viewingSlip` i `SalaryPage.tsx` for å finne PDF-visningskomponenten.

- [ ] **Steg 2: Legg til fallback-nedlasting**

I visningskomponenten (der `slipPdfBase64` brukes til å vise PDF):

```typescript
const [pdfSrc, setPdfSrc] = useState<string | null>(viewingSlip?.slipPdfBase64 ?? null)

useEffect(() => {
  if (viewingSlip?.slipPdfBase64) {
    setPdfSrc(viewingSlip.slipPdfBase64)
    return
  }
  if (viewingSlip?.slipStoragePath) {
    import('@/lib/slipStorage').then(({ downloadSlipPDF }) => {
      downloadSlipPDF(viewingSlip.slipStoragePath!).then((base64) => {
        if (base64) setPdfSrc(base64)
      })
    })
  }
}, [viewingSlip])
```

Erstatt alle referanser til `viewingSlip.slipPdfBase64` med `pdfSrc`.

- [ ] **Steg 3: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```

- [ ] **Steg 4: Commit og push**

```bash
git add src/pages/economy/SalaryPage.tsx
git commit -m "feat(slip-storage): hent PDF fra Supabase Storage om lokal cache mangler"
git push
```

---

## Spec-sjekk

- [x] Upload ved import → Task 4
- [x] `slipStoragePath` synkes til Supabase → Task 5
- [x] Migrasjon av eksisterende lokale PDFer → Task 5
- [x] Visning henter fra Storage om base64 mangler → Task 6
- [x] Bucket med RLS → Task 1
- [x] Type oppdatert → Task 2
