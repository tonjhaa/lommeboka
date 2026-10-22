import { describe, it, expect } from 'vitest'
import { addCategory, removeCategory, renameCategory, summarizeCategories } from '../categoryOps'
import type { ClothingItem } from '../clothingTypes'

const item = (id: string, category: string, over: Partial<ClothingItem> = {}): ClothingItem => ({
  id, category, subcategory: '', sizeScale: 'hoyde', note: '', sizes: {}, ...over,
})

describe('summarizeCategories', () => {
  it('teller rader og plagg per kategori, sortert på norsk', () => {
    const items = [
      item('1', 'Sokker', { sizeScale: 'alder', sizes: { '0-3 mnd': 2 } }),
      item('2', 'Body', { subcategory: 'Lang', sizes: { '62': 1, '68': 2 } }),
      item('3', 'Body', { subcategory: 'Kort', sizes: { '62': 1 } }),
    ]
    expect(summarizeCategories(items)).toEqual([
      { category: 'Body', sizeScale: 'hoyde', rows: 2, plagg: 4 },
      { category: 'Sokker', sizeScale: 'alder', rows: 1, plagg: 2 },
    ])
  })
})

describe('addCategory', () => {
  it('legger til en tom rad med valgt størrelsesskala', () => {
    const r = addCategory([], ' Badetøy ', 'hoyde', 'x')
    expect(r.ok && r.items).toEqual([item('x', 'Badetøy', { storeUrl: '' })])
  })
  it('avviser tomt navn og duplikat (case-insensitivt)', () => {
    expect(addCategory([], '  ', 'hoyde', 'x').ok).toBe(false)
    expect(addCategory([item('1', 'Body')], 'body', 'hoyde', 'x').ok).toBe(false)
  })
})

describe('renameCategory', () => {
  it('gir nytt navn til alle rader i kategorien', () => {
    const r = renameCategory([item('1', 'Body', { subcategory: 'A' }), item('2', 'Body', { subcategory: 'B' }), item('3', 'Lue')], 'Body', 'Bodyer')
    expect(r.ok && r.items.map(i => i.category)).toEqual(['Bodyer', 'Bodyer', 'Lue'])
  })
  it('slår sammen med eksisterende kategori og summerer like underkategorier', () => {
    const items = [
      item('1', 'Body', { sizes: { '62': 1 } }),
      item('2', 'Bodyer', { sizes: { '62': 2, '68': 1 } }),
    ]
    const r = renameCategory(items, 'Body', 'bodyer')
    expect(r.ok && r.items).toHaveLength(1)
    expect(r.ok && r.items[0].category).toBe('Bodyer')
    expect(r.ok && r.items[0].sizes).toEqual({ '62': 3, '68': 1 })
  })
  it('nekter sammenslåing på tvers av størrelsesskala', () => {
    const items = [item('1', 'Sko', { sizeScale: 'sko' }), item('2', 'Tøfler')]
    expect(renameCategory(items, 'Tøfler', 'Sko').ok).toBe(false)
  })
  it('tillater endring av store/små bokstaver på samme kategori', () => {
    const r = renameCategory([item('1', 'body')], 'body', 'Body')
    expect(r.ok && r.items[0].category).toBe('Body')
  })
  it('avviser tomt navn og ukjent kategori', () => {
    expect(renameCategory([item('1', 'Body')], 'Body', ' ').ok).toBe(false)
    expect(renameCategory([item('1', 'Body')], 'Finnes ikke', 'X').ok).toBe(false)
  })
})

describe('removeCategory', () => {
  it('fjerner alle rader i kategorien', () => {
    expect(removeCategory([item('1', 'Body'), item('2', 'Body'), item('3', 'Lue')], 'Body').map(i => i.id)).toEqual(['3'])
  })
})
