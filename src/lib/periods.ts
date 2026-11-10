/**
 * Reglas de periodos y conservación de datos.
 *
 * La aplicación conserva dos años naturales: el actual y el anterior. El 1 de
 * enero se elimina el año más antiguo. Ejemplo: durante 2026 se guardan 2025 y
 * 2026; el 1 de enero de 2027 se elimina 2025 (y se guardan 2026 y 2027).
 */

export const TIME_ZONE = "Europe/Madrid";
/** Años naturales que se conservan (el actual y los anteriores hasta completar esta cifra). */
export const YEARS_KEPT = 2;

/** Mes en formato "YYYY-MM". */
export type MonthKey = string;

export type Retention = {
  /** Fecha de hoy (zona horaria de la app) en formato "YYYY-MM-DD". */
  today: string;
  currentMonth: MonthKey;
  currentYear: number;
  /** Años conservados, del más antiguo al más reciente. */
  years: number[];
  /** Meses conservados, del más antiguo al más reciente (hasta 24). */
  months: MonthKey[];
  /** Primer día conservado. Todo lo anterior se elimina. */
  cutoffDate: string;
  /** Último día en el que se pueden registrar gastos (fin del mes en curso). */
  maxDate: string;
  /** Próxima fecha de borrado automático: el 1 de enero. */
  nextPurgeDate: string;
  /** Año que se eliminará en la próxima fecha de borrado. */
  yearToPurge: number;
};

export function todayInAppZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

export function lastDayOfMonth(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function getRetention(now: Date = new Date()): Retention {
  const today = todayInAppZone(now);
  const currentMonth = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const firstYear = currentYear - (YEARS_KEPT - 1);

  const years: number[] = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);

  const months: MonthKey[] = [];
  for (let m = `${firstYear}-01`; m <= currentMonth; m = shiftMonth(m, 1)) months.push(m);

  return {
    today,
    currentMonth,
    currentYear,
    years,
    months,
    cutoffDate: `${firstYear}-01-01`,
    maxDate: lastDayOfMonth(currentMonth),
    nextPurgeDate: `${currentYear + 1}-01-01`,
    yearToPurge: firstYear,
  };
}

export function isValidMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatShortMonth(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Mes abreviado ("Ene", "Feb"…) para selectores compactos. */
export function monthShortName(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)))
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDate(date: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(
    "es-ES",
    style === "long"
      ? { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
      : { day: "2-digit", month: "short", timeZone: "UTC" },
  ).format(new Date(Date.UTC(y, m - 1, d)));
}
