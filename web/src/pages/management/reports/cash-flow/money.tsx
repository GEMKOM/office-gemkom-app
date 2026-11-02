import { formatCurrency } from '@/lib/format';
import { FaIcon } from '@/ui';
import { num } from './cashFlowData';
import classes from './cashFlow.module.css';

/** "€1.234,56" for anything numeric, €0,00 otherwise (legacy fmtMoney). */
export function eur(value: unknown): string {
  return formatCurrency(num(value), 'EUR', 2);
}

/** "+€1.234,56" / "−€1.234,56": the sign names the direction. */
export function eurSigned(value: unknown): string {
  const n = num(value);
  if (n < 0) return `−${eur(Math.abs(n))}`;
  if (n > 0) return `+${eur(n)}`;
  return eur(0);
}

/** "€1.234,56 EUR"-free native amount: "1.234,56 TRY" when the currency is unknown to Intl. */
export function nativeAmount(value: unknown, currency: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const c = currency || 'EUR';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 2,
    }).format(num(value));
  } catch {
    return `${num(value).toLocaleString('tr-TR')} ${c}`;
  }
}

/** "1.234,56 USD" (drill-down original amounts). */
export function amountWithCode(value: unknown, currency: string | null | undefined): string {
  const c = (currency || 'EUR').toUpperCase();
  return `${num(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

/** "+12,3%" (legacy fmtPct). */
export function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

/** A net amount with its direction as an arrow and a sign, green in / red out. */
export function NetAmount({ value, bold = false }: { value: number; bold?: boolean }) {
  const tone = value > 0 ? 'in' : value < 0 ? 'out' : 'flat';
  const icon = value > 0 ? 'fas fa-arrow-up' : value < 0 ? 'fas fa-arrow-down' : 'fas fa-minus';
  return (
    <span className={classes.net} data-tone={tone} style={bold ? { fontWeight: 700 } : undefined}>
      <FaIcon icon={icon} />
      {eurSigned(value)}
    </span>
  );
}
