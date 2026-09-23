/**
 * The one CSV writer every export on the site goes through.
 *
 * Cells are quoted per RFC 4180, so an ENS name or subgraph title with a comma or quote in it
 * cannot shift the columns after it. Text that a spreadsheet would run as a formula is prefixed
 * with a quote, because names are chosen by whoever registered them.
 */

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = value;
  if (FORMULA.test(s) && !/^-\d/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

/**
 * Wei as an exact decimal GRT string. `weiToGRT` goes through a float, which is fine on screen
 * and wrong in a spreadsheet somebody reconciles against the chain.
 */
export function weiToGRTExact(wei: string | null | undefined): string {
  if (wei == null || wei === '') return '';
  let n: bigint;
  try {
    n = BigInt(wei);
  } catch {
    return '';
  }
  const neg = n < BigInt(0);
  if (neg) n = -n;
  const unit = BigInt(10) ** BigInt(18);
  const whole = (n / unit).toString();
  const frac = (n % unit).toString().padStart(18, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export function csvFilename(name: string): string {
  return name.toLowerCase().endsWith('.csv') ? name : `${name}.csv`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFilename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
