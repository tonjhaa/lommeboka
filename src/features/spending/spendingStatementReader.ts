import { parseSpendingCSV } from '@/domain/economy/spendingStatementParser'
import type { BankSpendingTransaction } from '@/types/economy'

export async function parseSpendingFile(file: File): Promise<BankSpendingTransaction[]> {
  let text: string
  try {
    const buf = await file.arrayBuffer()
    text = new TextDecoder('windows-1252').decode(buf)
    if (!text.includes(';')) throw new Error('ikke CSV')
  } catch {
    text = await file.text()
  }
  return parseSpendingCSV(text)
}
