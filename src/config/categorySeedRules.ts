import type { BudgetCategory } from '@/types/economy'

/** Innebygde motpart→kategori-regler (substring-match mot normalisert nøkkel).
 *  Kort, vedlikeholdbar startliste — de vanligste norske kjedene. Resten lærer brukeren opp. */
export const SEED_CATEGORY_RULES: { match: string; category: BudgetCategory }[] = [
  // Mat / dagligvare
  { match: 'rema', category: 'mat' }, { match: 'kiwi', category: 'mat' },
  { match: 'meny', category: 'mat' }, { match: 'coop', category: 'mat' },
  { match: 'extra', category: 'mat' }, { match: 'spar', category: 'mat' },
  { match: 'bunnpris', category: 'mat' }, { match: 'joker', category: 'mat' },
  { match: 'oda', category: 'mat' }, { match: 'foodora', category: 'mat' },
  // Transport
  { match: 'circle k', category: 'transport' }, { match: 'esso', category: 'transport' },
  { match: 'shell', category: 'transport' }, { match: 'uno-x', category: 'transport' },
  { match: 'vy', category: 'transport' }, { match: 'atb', category: 'transport' },
  { match: 'ruter', category: 'transport' }, { match: 'bolt', category: 'transport' },
  // Abonnement / strømming
  { match: 'netflix', category: 'abonnement' }, { match: 'spotify', category: 'abonnement' },
  { match: 'hbo', category: 'abonnement' }, { match: 'viaplay', category: 'abonnement' },
  { match: 'disney', category: 'abonnement' }, { match: 'storytel', category: 'abonnement' },
  { match: 'telenor', category: 'abonnement' }, { match: 'telia', category: 'abonnement' },
  // Helse
  { match: 'apotek', category: 'helse' }, { match: 'vitusapotek', category: 'helse' },
  { match: 'boots', category: 'helse' }, { match: 'legevakt', category: 'helse' },
  // Klær
  { match: 'h&m', category: 'klær' }, { match: 'zara', category: 'klær' },
  { match: 'cubus', category: 'klær' }, { match: 'zalando', category: 'klær' },
  // Fritid
  { match: 'vinmonopol', category: 'fritid' }, { match: 'sats', category: 'fritid' },
  { match: 'komplett', category: 'fritid' }, { match: 'elkjøp', category: 'fritid' },
]
