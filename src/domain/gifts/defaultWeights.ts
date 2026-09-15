import type {
  WeightRules, GiftSettings, Occasion, RelationshipType, LifePhase,
} from '@/types/gifts'

export const OCCASION_LABELS: Record<Occasion, string> = {
  bursdag: 'Bursdag',
  jul: 'Jul',
  bryllup: 'Bryllup',
  konfirmasjon: 'Konfirmasjon',
  dåp: 'Dåp/navnefest',
  jubileum: 'Jubileum',
  rund_dag: 'Rund dag',
  atten_år: '18-årsdag',
  student: 'Student/eksamen',
  innflytting: 'Innflytting',
  nyfødt: 'Nyfødt barn',
  vertskap: 'Vertskapsgave',
  kondolanse: 'Kondolanse/blomst',
  annet: 'Annet',
}

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  partner: 'Partner/samboer',
  foreldre: 'Foreldre',
  svigerforeldre: 'Svigerforeldre',
  søsken: 'Søsken',
  svigersøsken: 'Svigersøsken',
  besteforeldre: 'Besteforeldre',
  barn: 'Barn',
  stebarn: 'Stebarn',
  tante_onkel: 'Tante/onkel',
  niese_nevø: 'Niese/nevø',
  fadderbarn: 'Fadderbarn',
  nær_venn: 'Nær venn',
  venn: 'Venn',
  barn_av_venn: 'Barn av venn',
  kollega: 'Kollega',
  nabo: 'Nabo',
  vertskap: 'Vertskap',
  annet: 'Annet',
}

export const LIFE_PHASE_LABELS: Record<LifePhase, string> = {
  barn_0_12: 'Barn (0–12)',
  tenåring: 'Tenåring (13–17)',
  ung_voksen: 'Ung voksen (18–25)',
  voksen: 'Voksen (26–66)',
  senior: 'Senior (67+)',
  student: 'Student',
  nyetablert: 'Nyetablert',
  småbarnsforelder: 'Småbarnsforelder',
  pensjonist: 'Pensjonist',
  ikke_relevant: 'Ikke relevant',
}

export const OWNERSHIP_LABELS: Record<import('@/types/gifts').Ownership, string> = {
  A: 'Person A',
  B: 'Person B',
  felles: 'Felles',
}

export const STATUS_LABELS: Record<import('@/types/gifts').EventStatus, string> = {
  planlagt: 'Planlagt',
  kjøpt: 'Kjøpt',
  droppet: 'Droppet',
}

export const DISTRIBUTION_LABELS: Record<import('@/types/gifts').DistributionModel, string> = {
  '50_50': '50/50',
  inntekt: 'Nettoinntektsbasert',
  eierskap: 'Eierskapsbasert',
  hybrid: 'Hybridmodell (anbefalt)',
  familie_venn: 'Familie/venn-modell',
}

export const DEFAULT_WEIGHT_RULES: WeightRules = {
  relationshipBaseAmounts: {
    partner: 900,
    foreldre: 700,
    svigerforeldre: 600,
    søsken: 650,
    svigersøsken: 500,
    besteforeldre: 550,
    barn: 800,
    stebarn: 700,
    tante_onkel: 450,
    niese_nevø: 600,
    fadderbarn: 600,
    nær_venn: 550,
    venn: 400,
    barn_av_venn: 250,
    kollega: 250,
    nabo: 200,
    vertskap: 300,
    annet: 500,
  },
  occasionOverrides: {},
}

export const DEFAULT_GIFT_SETTINGS: GiftSettings = {
  memberA: { name: 'Person A', monthlyNetIncome: 0 },
  memberB: { name: 'Person B', monthlyNetIncome: 0 },
  bufferPercent: 12,
  annualCap: undefined,
  roundingNearest: 1,
  distributionModel: 'hybrid',
  primaryResponsibilityShare: 0.80,
  supportShare: 0.20,
}

