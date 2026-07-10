/**
 * Tolerant parsing av tall skrevet som fritekst i norske formater:
 *   "350000", "350 000", "350.000", "kr 350 000", "350 000,-", "4,5 %", "4.5%"
 *
 * Regler:
 * - Alt som ikke er siffer, komma, punktum eller minus strippes (kr, %, nbsp, «,-» osv.)
 * - Finnes både punktum og komma: den SISTE av dem er desimalskilletegn,
 *   den andre er tusenskille ("1.234,56" → 1234.56, "1,234.56" → 1234.56)
 * - Kun punktum: tusenskille når hver gruppe etter den første har nøyaktig
 *   3 sifre ("350.000" → 350000, "1.234.567" → 1234567), ellers desimal
 *   ("4.5" → 4.5)
 * - Kun komma: norsk desimalskilletegn ("4,5" → 4.5, "6,125" → 6.125) —
 *   med mindre det er FLERE kommaer i 3-siffergrupper ("1,234,567" → 1234567,
 *   engelsk tusenskille)
 *
 * Returnerer null når teksten ikke inneholder noe tolkbart tall.
 */
export function parseFlexibleNumber(text: string): number | null {
  const cleaned = text
    .replace(/,-\s*$/, '')          // "350 000,-" → "350 000"
    .replace(/[^\d.,\-]/g, '')      // fjern kr, %, mellomrom (inkl. nbsp), bokstaver
  if (!/\d/.test(cleaned)) return null

  const negative = cleaned.startsWith('-')
  const body = cleaned.replace(/-/g, '')

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')

  let normalized: string
  if (lastDot !== -1 && lastComma !== -1) {
    // Begge finnes — den siste er desimalskilletegnet
    const decimalSep = lastDot > lastComma ? '.' : ','
    const thousandSep = decimalSep === '.' ? ',' : '.'
    normalized = body.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ','
    const parts = body.split(sep)
    const groupsOfThree =
      parts[0].length >= 1 && parts.slice(1).every((p) => p.length === 3)
    // Punktum: tusenskille ved 3-siffergrupper ("350.000"). Komma: norsk
    // desimal ("6,125" = 6.125) — kun tusenskille ved FLERE kommaer i
    // 3-siffergrupper (engelsk stil "1,234,567").
    const isThousandPattern =
      sep === '.' ? groupsOfThree : groupsOfThree && parts.length > 2
    normalized = isThousandPattern
      ? parts.join('')
      : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`
  } else {
    normalized = body
  }

  const n = parseFloat(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}
