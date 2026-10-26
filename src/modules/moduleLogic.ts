export type JournalLineDraft = {
  account: string;
  debit: string;
  credit: string;
};

export function isDateRangeValid(from: string, to: string): boolean {
  return !from || !to || from <= to;
}

export function getJournalLineError(lines: JournalLineDraft[]): string | null {
  if (lines.length < 2) return "Journal entry must have at least two lines.";
  if (lines.some((line) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    return !line.account || !Number.isFinite(debit) || !Number.isFinite(credit) ||
      (debit > 0 && Math.round(debit * 100) === 0) || (credit > 0 && Math.round(credit * 100) === 0) ||
      (debit > 0) === (credit > 0) || debit < 0 || credit < 0;
  })) return "Each line needs exactly one positive debit or credit.";
  const debitMinor = lines.reduce((total, line) => total + Math.round(Number(line.debit || 0) * 100), 0);
  const creditMinor = lines.reduce((total, line) => total + Math.round(Number(line.credit || 0) * 100), 0);
  if (debitMinor !== creditMinor) return "Journal entry must be balanced before it can be posted.";
  return null;
}

export function getJournalTotals(lines: JournalLineDraft[]) {
  const debits = lines.reduce((total, line) => total + Math.round(Number(line.debit || 0) * 100), 0);
  const credits = lines.reduce((total, line) => total + Math.round(Number(line.credit || 0) * 100), 0);
  return { debits: debits / 100, credits: credits / 100, difference: (debits - credits) / 100 };
}
