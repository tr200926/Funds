const CAIRO_TIMEZONE = "Africa/Cairo";

const RELATIVE_THRESHOLDS = [
  { limit: 60, unit: "second", divisor: 1 },
  { limit: 60 * 60, unit: "minute", divisor: 60 },
  { limit: 60 * 60 * 24, unit: "hour", divisor: 60 * 60 },
  { limit: 60 * 60 * 24 * 30, unit: "day", divisor: 60 * 60 * 24 },
];

function toDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseNumeric(value: string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(
  value: string | null | undefined,
  currency: string = "EGP"
): string {
  const amount = parseNumeric(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCairoDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const parsed = toDate(date);
  if (!parsed) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(parsed);
}

export function formatRelativeTime(date: string | Date): string {
  const parsed = toDate(date);
  if (!parsed) {
    return "Invalid date";
  }

  const diffSeconds = Math.round((Date.now() - parsed.getTime()) / 1000);

  if (Math.abs(diffSeconds) < 15) {
    return "Just now";
  }

  for (const { limit, unit, divisor } of RELATIVE_THRESHOLDS) {
    if (Math.abs(diffSeconds) < limit) {
      const value = Math.round(diffSeconds / divisor);
      const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      return formatter.format(-value, unit as Intl.RelativeTimeFormatUnit);
    }
  }

  const days = Math.round(diffSeconds / (60 * 60 * 24));
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return formatter.format(-days, "day");
}

export function calcTimeToDepletion(
  balance: string | null | undefined,
  dailySpend: string | null | undefined
): number | null {
  const balanceValue = parseNumeric(balance);
  const dailySpendValue = parseNumeric(dailySpend);

  if (balanceValue <= 0 || dailySpendValue <= 0) {
    return null;
  }

  return balanceValue / dailySpendValue;
}
