/**
 * Forhåndsdefinerte verdier for ~100 av de vanligste bilene i Norge.
 *
 * ALT her er grove ESTIMATER (2026-nivå) ment som startpunkt:
 * - forbruk: typisk blandet kjøring (WLTP + normalt påslag)
 * - insuranceMonthly: typisk kasko for fører 30+ med bonus — varierer mye
 * - depreciationPct: grov årlig verditapsklasse for merket/segmentet
 *
 * Brukeren kan overstyre alt etter valg. Ikke fasit.
 */

import type { FuelType } from '@/utils/carLoanCalculator'

export interface CarPreset {
  id: string
  label: string
  fuelType: FuelType
  /** l/100 km (fossildel) */
  fossilPer100?: number
  /** kWh/100 km (el-del) */
  kwhPer100?: number
  /** Andel elektrisk kjøring, kun ladbar hybrid */
  electricSharePct?: number
  /** Estimert forsikring kr/mnd */
  insuranceMonthly: number
  /** Estimert verditap %/år */
  depreciationPct: number
}

const p = (
  id: string, label: string, fuelType: FuelType,
  opts: Partial<Pick<CarPreset, 'fossilPer100' | 'kwhPer100' | 'electricSharePct'>>,
  insuranceMonthly: number, depreciationPct: number,
): CarPreset => ({ id, label, fuelType, ...opts, insuranceMonthly, depreciationPct })

export const CAR_PRESETS: CarPreset[] = [
  // ── Elbiler ──────────────────────────────────────────────
  p('tesla-model-y', 'Tesla Model Y', 'el', { kwhPer100: 17 }, 1050, 14),
  p('tesla-model-3', 'Tesla Model 3', 'el', { kwhPer100: 15 }, 1000, 14),
  p('tesla-model-s', 'Tesla Model S', 'el', { kwhPer100: 19 }, 1250, 15),
  p('tesla-model-x', 'Tesla Model X', 'el', { kwhPer100: 22 }, 1300, 15),
  p('vw-id3', 'Volkswagen ID.3', 'el', { kwhPer100: 17 }, 800, 13),
  p('vw-id4', 'Volkswagen ID.4', 'el', { kwhPer100: 18 }, 900, 13),
  p('vw-id5', 'Volkswagen ID.5', 'el', { kwhPer100: 18 }, 950, 13),
  p('vw-id-buzz', 'Volkswagen ID.Buzz', 'el', { kwhPer100: 21 }, 1000, 13),
  p('skoda-enyaq', 'Skoda Enyaq', 'el', { kwhPer100: 18 }, 900, 12),
  p('skoda-elroq', 'Skoda Elroq', 'el', { kwhPer100: 17 }, 850, 12),
  p('audi-q4-etron', 'Audi Q4 e-tron', 'el', { kwhPer100: 19 }, 1000, 12),
  p('audi-q6-etron', 'Audi Q6 e-tron', 'el', { kwhPer100: 18 }, 1100, 12),
  p('audi-q8-etron', 'Audi Q8 e-tron', 'el', { kwhPer100: 23 }, 1200, 13),
  p('bmw-i4', 'BMW i4', 'el', { kwhPer100: 18 }, 1050, 12),
  p('bmw-ix1', 'BMW iX1', 'el', { kwhPer100: 18 }, 950, 12),
  p('bmw-ix3', 'BMW iX3', 'el', { kwhPer100: 19 }, 1000, 12),
  p('bmw-ix', 'BMW iX', 'el', { kwhPer100: 21 }, 1250, 13),
  p('mercedes-eqa', 'Mercedes-Benz EQA', 'el', { kwhPer100: 18 }, 1000, 13),
  p('mercedes-eqb', 'Mercedes-Benz EQB', 'el', { kwhPer100: 19 }, 1050, 13),
  p('mercedes-eqc', 'Mercedes-Benz EQC', 'el', { kwhPer100: 22 }, 1100, 14),
  p('nissan-leaf', 'Nissan Leaf', 'el', { kwhPer100: 17 }, 700, 13),
  p('nissan-ariya', 'Nissan Ariya', 'el', { kwhPer100: 19 }, 900, 13),
  p('hyundai-kona-el', 'Hyundai Kona Electric', 'el', { kwhPer100: 15 }, 750, 13),
  p('hyundai-ioniq5', 'Hyundai Ioniq 5', 'el', { kwhPer100: 18 }, 950, 13),
  p('hyundai-ioniq6', 'Hyundai Ioniq 6', 'el', { kwhPer100: 15 }, 950, 13),
  p('kia-eniro', 'Kia e-Niro / Niro EV', 'el', { kwhPer100: 16 }, 800, 12),
  p('kia-ev6', 'Kia EV6', 'el', { kwhPer100: 18 }, 950, 12),
  p('kia-ev9', 'Kia EV9', 'el', { kwhPer100: 22 }, 1150, 13),
  p('kia-soul-el', 'Kia Soul Electric', 'el', { kwhPer100: 16 }, 750, 13),
  p('polestar-2', 'Polestar 2', 'el', { kwhPer100: 18 }, 1000, 14),
  p('polestar-4', 'Polestar 4', 'el', { kwhPer100: 19 }, 1100, 14),
  p('volvo-ex30', 'Volvo EX30', 'el', { kwhPer100: 17 }, 850, 12),
  p('volvo-xc40-el', 'Volvo XC40/EX40 Electric', 'el', { kwhPer100: 19 }, 950, 12),
  p('volvo-ex90', 'Volvo EX90', 'el', { kwhPer100: 21 }, 1250, 12),
  p('peugeot-e208', 'Peugeot e-208', 'el', { kwhPer100: 15 }, 700, 14),
  p('peugeot-e2008', 'Peugeot e-2008', 'el', { kwhPer100: 16 }, 750, 14),
  p('opel-corsa-e', 'Opel Corsa-e', 'el', { kwhPer100: 16 }, 700, 14),
  p('opel-mokka-e', 'Opel Mokka-e', 'el', { kwhPer100: 16 }, 750, 14),
  p('renault-zoe', 'Renault Zoe', 'el', { kwhPer100: 17 }, 650, 15),
  p('renault-megane-e', 'Renault Megane E-Tech', 'el', { kwhPer100: 16 }, 800, 14),
  p('mg4', 'MG4', 'el', { kwhPer100: 16 }, 700, 16),
  p('mg-zs-ev', 'MG ZS EV', 'el', { kwhPer100: 17 }, 700, 16),
  p('byd-atto3', 'BYD Atto 3', 'el', { kwhPer100: 16 }, 750, 16),
  p('byd-seal', 'BYD Seal', 'el', { kwhPer100: 16 }, 850, 16),
  p('xpeng-g3', 'XPeng G3', 'el', { kwhPer100: 16 }, 750, 17),
  p('ford-mach-e', 'Ford Mustang Mach-E', 'el', { kwhPer100: 19 }, 950, 14),
  p('toyota-bz4x', 'Toyota bZ4X', 'el', { kwhPer100: 16 }, 850, 11),
  p('mazda-mx30', 'Mazda MX-30', 'el', { kwhPer100: 17 }, 750, 15),
  p('cupra-born', 'Cupra Born', 'el', { kwhPer100: 16 }, 850, 13),
  p('fiat-500e', 'Fiat 500e', 'el', { kwhPer100: 14 }, 650, 15),
  p('mini-cooper-se', 'Mini Cooper SE', 'el', { kwhPer100: 16 }, 800, 13),
  p('porsche-taycan', 'Porsche Taycan', 'el', { kwhPer100: 21 }, 1500, 13),
  // ── Ladbare hybrider ─────────────────────────────────────
  p('mitsubishi-outlander-phev', 'Mitsubishi Outlander PHEV', 'ladbar_hybrid', { kwhPer100: 20, fossilPer100: 8.0, electricSharePct: 55 }, 850, 12),
  p('volvo-xc60-t8', 'Volvo XC60 T8 ladbar', 'ladbar_hybrid', { kwhPer100: 22, fossilPer100: 8.5, electricSharePct: 50 }, 1050, 11),
  p('volvo-xc90-t8', 'Volvo XC90 T8 ladbar', 'ladbar_hybrid', { kwhPer100: 23, fossilPer100: 9.0, electricSharePct: 45 }, 1200, 11),
  p('volvo-xc40-phev', 'Volvo XC40 ladbar', 'ladbar_hybrid', { kwhPer100: 19, fossilPer100: 7.5, electricSharePct: 55 }, 950, 11),
  p('toyota-rav4-phev', 'Toyota RAV4 ladbar', 'ladbar_hybrid', { kwhPer100: 18, fossilPer100: 6.5, electricSharePct: 65 }, 900, 9),
  p('bmw-330e', 'BMW 330e', 'ladbar_hybrid', { kwhPer100: 18, fossilPer100: 7.0, electricSharePct: 50 }, 1000, 11),
  p('bmw-x1-25e', 'BMW X1 xDrive25e', 'ladbar_hybrid', { kwhPer100: 17, fossilPer100: 6.8, electricSharePct: 55 }, 950, 11),
  p('mercedes-glc300e', 'Mercedes-Benz GLC 300e', 'ladbar_hybrid', { kwhPer100: 21, fossilPer100: 8.0, electricSharePct: 50 }, 1100, 11),
  p('mercedes-a250e', 'Mercedes-Benz A250e', 'ladbar_hybrid', { kwhPer100: 16, fossilPer100: 6.5, electricSharePct: 55 }, 900, 12),
  p('vw-passat-gte', 'Volkswagen Passat GTE', 'ladbar_hybrid', { kwhPer100: 17, fossilPer100: 6.5, electricSharePct: 55 }, 850, 12),
  p('vw-golf-gte', 'Volkswagen Golf GTE', 'ladbar_hybrid', { kwhPer100: 16, fossilPer100: 6.2, electricSharePct: 55 }, 800, 12),
  p('vw-tiguan-ehybrid', 'Volkswagen Tiguan eHybrid', 'ladbar_hybrid', { kwhPer100: 18, fossilPer100: 7.5, electricSharePct: 50 }, 900, 12),
  p('kia-niro-phev', 'Kia Niro ladbar', 'ladbar_hybrid', { kwhPer100: 14, fossilPer100: 5.5, electricSharePct: 60 }, 800, 11),
  p('kia-sportage-phev', 'Kia Sportage ladbar', 'ladbar_hybrid', { kwhPer100: 17, fossilPer100: 6.8, electricSharePct: 55 }, 850, 11),
  p('hyundai-tucson-phev', 'Hyundai Tucson ladbar', 'ladbar_hybrid', { kwhPer100: 17, fossilPer100: 6.8, electricSharePct: 55 }, 850, 11),
  p('hyundai-santafe-phev', 'Hyundai Santa Fe ladbar', 'ladbar_hybrid', { kwhPer100: 19, fossilPer100: 7.5, electricSharePct: 50 }, 950, 11),
  p('ford-kuga-phev', 'Ford Kuga ladbar', 'ladbar_hybrid', { kwhPer100: 17, fossilPer100: 6.2, electricSharePct: 60 }, 850, 12),
  p('peugeot-3008-phev', 'Peugeot 3008 ladbar', 'ladbar_hybrid', { kwhPer100: 18, fossilPer100: 6.8, electricSharePct: 55 }, 850, 13),
  p('lexus-nx450h', 'Lexus NX 450h+ ladbar', 'ladbar_hybrid', { kwhPer100: 18, fossilPer100: 6.5, electricSharePct: 60 }, 1050, 9),
  // ── Hybrider (ikke ladbare) ──────────────────────────────
  p('toyota-yaris-h', 'Toyota Yaris Hybrid', 'hybrid', { fossilPer100: 4.2 }, 650, 8),
  p('toyota-yaris-cross', 'Toyota Yaris Cross Hybrid', 'hybrid', { fossilPer100: 4.6 }, 700, 8),
  p('toyota-corolla-h', 'Toyota Corolla Hybrid', 'hybrid', { fossilPer100: 4.5 }, 700, 8),
  p('toyota-rav4-h', 'Toyota RAV4 Hybrid', 'hybrid', { fossilPer100: 5.5 }, 850, 8),
  p('toyota-chr', 'Toyota C-HR Hybrid', 'hybrid', { fossilPer100: 4.8 }, 750, 9),
  p('toyota-prius', 'Toyota Prius', 'hybrid', { fossilPer100: 4.3 }, 700, 9),
  p('honda-crv-h', 'Honda CR-V Hybrid', 'hybrid', { fossilPer100: 5.5 }, 850, 10),
  p('suzuki-vitara-h', 'Suzuki Vitara Hybrid', 'hybrid', { fossilPer100: 5.3 }, 700, 11),
  p('kia-niro-h', 'Kia Niro Hybrid', 'hybrid', { fossilPer100: 4.8 }, 750, 10),
  // ── Bensin ───────────────────────────────────────────────
  p('vw-golf', 'Volkswagen Golf', 'bensin', { fossilPer100: 5.8 }, 750, 11),
  p('vw-polo', 'Volkswagen Polo', 'bensin', { fossilPer100: 5.2 }, 650, 11),
  p('vw-tiguan', 'Volkswagen Tiguan', 'bensin', { fossilPer100: 7.2 }, 900, 11),
  p('skoda-fabia', 'Skoda Fabia', 'bensin', { fossilPer100: 5.2 }, 650, 11),
  p('skoda-octavia', 'Skoda Octavia', 'bensin', { fossilPer100: 5.9 }, 750, 10),
  p('toyota-aygo', 'Toyota Aygo', 'bensin', { fossilPer100: 4.8 }, 600, 9),
  p('nissan-qashqai', 'Nissan Qashqai', 'bensin', { fossilPer100: 6.5 }, 800, 12),
  p('ford-focus', 'Ford Focus', 'bensin', { fossilPer100: 5.9 }, 750, 12),
  p('ford-puma', 'Ford Puma', 'bensin', { fossilPer100: 5.6 }, 750, 12),
  p('mazda-3', 'Mazda 3', 'bensin', { fossilPer100: 6.1 }, 750, 11),
  p('mazda-cx30', 'Mazda CX-30', 'bensin', { fossilPer100: 6.3 }, 800, 11),
  p('peugeot-208', 'Peugeot 208', 'bensin', { fossilPer100: 5.3 }, 650, 13),
  p('peugeot-308', 'Peugeot 308', 'bensin', { fossilPer100: 5.6 }, 750, 13),
  p('opel-astra', 'Opel Astra', 'bensin', { fossilPer100: 6.0 }, 750, 13),
  p('hyundai-i30', 'Hyundai i30', 'bensin', { fossilPer100: 6.2 }, 700, 12),
  p('kia-ceed', 'Kia Ceed', 'bensin', { fossilPer100: 6.3 }, 700, 11),
  p('dacia-sandero', 'Dacia Sandero', 'bensin', { fossilPer100: 5.8 }, 600, 14),
  p('dacia-duster', 'Dacia Duster', 'bensin', { fossilPer100: 6.8 }, 700, 14),
  p('suzuki-swift', 'Suzuki Swift', 'bensin', { fossilPer100: 4.9 }, 600, 11),
  p('honda-civic', 'Honda Civic', 'bensin', { fossilPer100: 6.0 }, 750, 10),
  p('audi-a3', 'Audi A3', 'bensin', { fossilPer100: 5.9 }, 850, 11),
  p('bmw-118i', 'BMW 118i', 'bensin', { fossilPer100: 6.0 }, 850, 11),
  p('subaru-forester', 'Subaru Forester', 'bensin', { fossilPer100: 7.5 }, 850, 11),
  p('subaru-outback', 'Subaru Outback', 'bensin', { fossilPer100: 7.3 }, 900, 11),
  // ── Diesel ───────────────────────────────────────────────
  p('vw-passat-d', 'Volkswagen Passat diesel', 'diesel', { fossilPer100: 5.2 }, 850, 12),
  p('skoda-superb-d', 'Skoda Superb diesel', 'diesel', { fossilPer100: 5.3 }, 850, 11),
  p('audi-a4-d', 'Audi A4 diesel', 'diesel', { fossilPer100: 4.9 }, 900, 11),
  p('audi-a6-d', 'Audi A6 diesel', 'diesel', { fossilPer100: 5.3 }, 1000, 12),
  p('audi-q5-d', 'Audi Q5 diesel', 'diesel', { fossilPer100: 5.8 }, 1000, 11),
  p('bmw-320d', 'BMW 320d', 'diesel', { fossilPer100: 5.0 }, 900, 11),
  p('bmw-520d', 'BMW 520d', 'diesel', { fossilPer100: 5.2 }, 1000, 12),
  p('bmw-x3-d', 'BMW X3 diesel', 'diesel', { fossilPer100: 5.8 }, 1000, 11),
  p('bmw-x5-d', 'BMW X5 diesel', 'diesel', { fossilPer100: 6.5 }, 1150, 12),
  p('mercedes-c220d', 'Mercedes-Benz C220d', 'diesel', { fossilPer100: 5.0 }, 950, 11),
  p('mercedes-e220d', 'Mercedes-Benz E220d', 'diesel', { fossilPer100: 5.2 }, 1050, 12),
  p('mercedes-glc-d', 'Mercedes-Benz GLC diesel', 'diesel', { fossilPer100: 5.8 }, 1050, 11),
  p('volvo-v60-d', 'Volvo V60 diesel', 'diesel', { fossilPer100: 4.9 }, 850, 11),
  p('volvo-v70-d', 'Volvo V70 diesel', 'diesel', { fossilPer100: 5.5 }, 800, 12),
  p('volvo-v90-d', 'Volvo V90 diesel', 'diesel', { fossilPer100: 5.3 }, 950, 11),
  p('volvo-xc60-d', 'Volvo XC60 diesel', 'diesel', { fossilPer100: 5.5 }, 950, 11),
  p('volvo-xc90-d', 'Volvo XC90 diesel', 'diesel', { fossilPer100: 6.2 }, 1100, 11),
  p('mazda-cx5-d', 'Mazda CX-5 diesel', 'diesel', { fossilPer100: 5.5 }, 850, 11),
  p('toyota-hilux', 'Toyota Hilux', 'diesel', { fossilPer100: 8.0 }, 950, 9),
  p('toyota-landcruiser', 'Toyota Land Cruiser', 'diesel', { fossilPer100: 8.5 }, 1100, 8),
  p('nissan-xtrail', 'Nissan X-Trail', 'diesel', { fossilPer100: 6.2 }, 850, 12),
  p('ford-kuga-d', 'Ford Kuga diesel', 'diesel', { fossilPer100: 5.8 }, 850, 12),
]

/** Enkelt søk: alle ord i søkestrengen må finnes i bilnavnet */
export function searchCarPresets(query: string, limit = 8): CarPreset[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return CAR_PRESETS
    .filter((preset) => words.every((w) => preset.label.toLowerCase().includes(w)))
    .slice(0, limit)
}
