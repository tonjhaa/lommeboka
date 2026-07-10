/**
 * Innsiktsmotor for bilkalkulatoren: kvantifiserte, prioriterte råd
 * beregnet med EKTE motor-kjøringer (ikke tommelfingerregler) — hver
 * innsikt re-kjører calculateCarLoan med en endret parameter og viser
 * den faktiske differansen.
 */

import {
  calculateCarLoan,
  computeEnergyCostMonthly,
  type CarLoanInputs,
  type CarLoanResult,
} from './carLoanCalculator'
import { LOAN_RATE_TIERS } from '@/config/carCost.config'

export interface CarLoanInsight {
  id: string
  severity: 'advarsel' | 'tips' | 'positiv'
  title: string
  detail: string
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

export function generateInsights(
  inputs: CarLoanInputs,
  result: CarLoanResult,
  currentSurplus: number
): CarLoanInsight[] {
  const insights: CarLoanInsight[] = []

  // 1. Neste EK-rentetrinn: hva koster det, hva sparer det?
  if (inputs.annualRateOverride === null && inputs.price > 0 && result.loanAmount > 0) {
    const equityPct = (inputs.equity / inputs.price) * 100
    const nextTier = [...LOAN_RATE_TIERS]
      .sort((a, b) => a.minEquityPct - b.minEquityPct)
      .find((t) => t.minEquityPct > equityPct)
    if (nextTier) {
      const neededEquity = Math.ceil((inputs.price * nextTier.minEquityPct) / 100 - inputs.equity)
      const altResult = calculateCarLoan({ ...inputs, equity: inputs.equity + neededEquity })
      const monthlySaving = result.totalMonthlyCost - altResult.totalMonthlyCost
      if (monthlySaving > 0) {
        insights.push({
          id: 'ek-trinn',
          severity: 'tips',
          title: `${fmt(neededEquity)} mer i egenkapital gir ${nextTier.rate} % rente`,
          detail: `Du når neste rentetrinn (${nextTier.minEquityPct} % EK) og senker månedskostnaden med ${fmt(monthlySaving)} — mindre lån OG lavere rente.`,
        })
      }
    }
  }

  // 2. Løpetids-avveining — hjelp i riktig retning
  if (result.loanAmount > 0) {
    if (result.affordability !== 'ok' && inputs.termYears < 10) {
      const longer = calculateCarLoan({ ...inputs, termYears: inputs.termYears + 1 })
      insights.push({
        id: 'lopetid-lengre',
        severity: 'tips',
        title: `Ett år lengre løpetid: ${fmt(longer.totalMonthlyCost - result.totalMonthlyCost)}/mnd`,
        detail: `Terminen synker med ${fmt(result.totalMonthlyCost - longer.totalMonthlyCost)}, men totale renter øker med ${fmt(longer.totalInterestCost - result.totalInterestCost)}.`,
      })
    } else if (result.affordability === 'ok' && inputs.termYears > 1) {
      const shorter = calculateCarLoan({ ...inputs, termYears: inputs.termYears - 1 })
      const extraMonthly = shorter.totalMonthlyCost - result.totalMonthlyCost
      const interestSaved = result.totalInterestCost - shorter.totalInterestCost
      if (interestSaved > 500 && shorter.myShareMonthly <= inputs.availableMonthlyBudget) {
        insights.push({
          id: 'lopetid-kortere',
          severity: 'tips',
          title: `Ett år kortere løpetid sparer ${fmt(interestSaved)} i renter`,
          detail: `Koster ${fmt(extraMonthly)} mer per måned — og du er fortsatt innenfor det du har å avse.`,
        })
      }
    }
  }

  // 3. Under vann-varsel
  if (result.underwaterUntilMonth !== null && result.underwaterUntilMonth >= 6) {
    insights.push({
      id: 'under-vann',
      severity: 'advarsel',
      title: `Du skylder mer enn bilen er verdt i ${Math.round(result.underwaterUntilMonth / 12 * 10) / 10} år`,
      detail: 'Må du selge i denne perioden, dekker ikke salgssummen lånet. Mer egenkapital eller kortere løpetid krymper gapet.',
    })
  }

  // 4. Buffer avslått
  if (!inputs.costs.buffer.enabled && result.totalMonthlyCost > 0) {
    insights.push({
      id: 'buffer',
      severity: 'advarsel',
      title: 'Ingen buffer for uforutsette kostnader',
      detail: 'EU-kontroll, reparasjoner og dekk kommer uansett — et par hundrelapper i måneden i buffer gir et ærligere bilde.',
    })
  }

  // 5. Elbil-sammenligning for fossilbiler (samme kjørelengde, standard el-forbruk)
  if ((inputs.fuelType === 'bensin' || inputs.fuelType === 'diesel') && inputs.annualKm > 0 && !inputs.energyOverride.enabled) {
    const elEnergy = computeEnergyCostMonthly({
      ...inputs,
      fuelType: 'el',
      fuelEconomy: { ...inputs.fuelEconomy, kwhPer100: null, fossilPer100: null },
    })
    const saving = result.energyCostMonthly - elEnergy
    if (saving > 300) {
      insights.push({
        id: 'elbil',
        severity: 'tips',
        title: `Tilsvarende elbil: ca. ${fmt(saving)} lavere energikostnad per måned`,
        detail: `Strøm ≈ ${fmt(elEnergy)}/mnd mot drivstoff ≈ ${fmt(result.energyCostMonthly)}/mnd med din kjørelengde (estimat med standard forbruk).`,
      })
    }
  }

  // 6. Andel av overskuddet
  if (currentSurplus > 0 && result.myShareMonthly > 0) {
    const share = result.myShareMonthly / currentSurplus
    if (share > 1) {
      insights.push({
        id: 'overskudd',
        severity: 'advarsel',
        title: 'Bilen koster mer enn hele budsjett-overskuddet ditt',
        detail: `Din andel (${fmt(result.myShareMonthly)}) overstiger overskuddet (${fmt(currentSurplus)}) — noe annet må vike.`,
      })
    } else if (share > 0.5) {
      insights.push({
        id: 'overskudd',
        severity: 'advarsel',
        title: `Bilen spiser ${Math.round(share * 100)} % av overskuddet ditt`,
        detail: `Det blir ${fmt(currentSurplus - result.myShareMonthly)} igjen per måned til sparing og alt annet uforutsett.`,
      })
    } else if (share > 0 && share <= 0.35) {
      insights.push({
        id: 'overskudd',
        severity: 'positiv',
        title: `God margin: bilen tar ${Math.round(share * 100)} % av overskuddet`,
        detail: `${fmt(currentSurplus - result.myShareMonthly)} igjen per måned etter bilkostnadene.`,
      })
    }
  }

  // 7. Serielån-tips (kun når annuitet er valgt og differansen er reell)
  if (inputs.loanType === 'annuitet' && result.loanAmount > 0) {
    const serie = calculateCarLoan({ ...inputs, loanType: 'serie' })
    const interestSaved = result.totalInterestCost - serie.totalInterestCost
    if (interestSaved > 2000) {
      insights.push({
        id: 'serielaan',
        severity: 'tips',
        title: `Serielån sparer ${fmt(interestSaved)} i renter totalt`,
        detail: `Til gjengjeld starter terminen ${fmt(serie.totalMonthlyCost - result.totalMonthlyCost)} høyere og synker over tid.`,
      })
    }
  }

  const order = { advarsel: 0, tips: 1, positiv: 2 }
  return insights.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 4)
}
