// ============================================================
// FORBRUKS-KATEGORISERING — ren, deterministisk.
// categorize(key, rules): tom regel-liste ⇒ null (ingen gjetting).
// Presedens: lært (eksakt) vinner over seed (substring).
// ============================================================

import type { BudgetCategory, BankSpendingTransaction, CategoryRule } from '@/types/economy'
import { SEED_CATEGORY_RULES } from '@/config/categorySeedRules'

/** Normaliser bankmotpart → matchbar nøkkel. Kollapser filialer, fjerner kort/dato/tall/sted.
 *  Strategi:
 *  1. Fjern betalingsprefiks-ord (visa, vare, …) og datoer (dd.mm / dd.mm.åå)
 *  2. Fjern tegnstøy (behold &)
 *  3. Fjern rene tall-token som er ≥ 4 siffer OG ikke umiddelbart etterfølger en bokstav
 *     (dvs. frittstående branch-ID-er, ikke tall i butikknavn som "rema 1000" / "7-eleven")
 *  4. Fjern rene bokstav-ord som dukker opp ETTER et tall-token (filial-/stednavn som OSLO)
 */
export function normalizeCounterparty(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/\b(visa|vare|kjøp|betaling|nok|kr)\b/g, ' ')   // betalings-/valuta-ord
    .replace(/\b\d{2}\.\d{2}(\.\d{2,4})?\b/g, ' ')           // datoer dd.mm og dd.mm.åå
    .replace(/[^a-zæøå0-9& ]+/g, ' ')                         // tegnstøy
    .replace(/\s+/g, ' ')
    .trim()

  // Tokeniser og fjern stednavn + branch-ID
  const tokens = s.split(' ')
  let seenNumber = false
  const result: string[] = []
  for (const tok of tokens) {
    if (!tok) continue
    const isNumber = /^\d+$/.test(tok)
    if (isNumber) {
      if (tok.length <= 4 && !seenNumber) {
        // Kort tall tidlig (f.eks. "1000" i "rema 1000") — behold som del av merkevarenavn
        result.push(tok)
        seenNumber = true
      }
      // Lenger tall eller tall etter at vi allerede har sett et tall → branch-ID, dropp
    } else {
      if (seenNumber) {
        // Rent bokstavord etter talltoken → stedsnavn (oslo, trondheim …), dropp
        if (/^[a-zæøå]+$/.test(tok)) continue
      }
      result.push(tok)
    }
  }

  return result.join(' ').replace(/\s+/g, ' ').trim()
}

/** Konverter seed-reglene til CategoryRule[] (source:'seed'). Stabile id-er. */
export function seedCategoryRules(): CategoryRule[] {
  return SEED_CATEGORY_RULES.map((s) => ({
    id: `seed:${s.match}`, merchantKey: s.match, category: s.category, source: 'seed' as const,
  }))
}

export interface CategorizeResult { category: BudgetCategory | null; source: 'learned' | 'seed' | 'none' }

/** Lært (eksakt key-match) vinner over seed (substring). Tom liste ⇒ null. */
export function categorize(key: string, rules: CategoryRule[]): CategorizeResult {
  for (const r of rules) {
    if (r.source === 'learned' && key === r.merchantKey) return { category: r.category, source: 'learned' }
  }
  for (const r of rules) {
    if (r.source === 'seed' && key.includes(r.merchantKey)) return { category: r.category, source: 'seed' }
  }
  return { category: null, source: 'none' }
}

/** Kategoriser et sett transaksjoner. Bevarer eksisterende 'manual'-kategori (brukeroverstyrt). */
export function applyCategories(txs: BankSpendingTransaction[], rules: CategoryRule[]): BankSpendingTransaction[] {
  return txs.map((t) => {
    if (t.categorySource === 'manual') return t   // ikke overstyr en eksplisitt enkelt-overstyring
    const { category, source } = categorize(t.counterpartyKey, rules)
    return { ...t, category, categorySource: category ? source : 'none' }
  })
}

/** Sum utgift (absoluttverdi av negative beløp) per kategori for valgt år+måned. */
export function aggregateByCategory(
  txs: BankSpendingTransaction[], year: number, month: number,
): Partial<Record<BudgetCategory, number>> {
  const out: Partial<Record<BudgetCategory, number>> = {}
  for (const t of txs) {
    if (t.amount >= 0 || !t.category) continue
    const d = new Date(t.date)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    out[t.category] = (out[t.category] ?? 0) + Math.abs(t.amount)
  }
  return out
}
