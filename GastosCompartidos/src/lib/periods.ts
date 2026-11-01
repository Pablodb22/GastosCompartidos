/**
 * Reglas de periodos y conservación de datos.
 *
 * La aplicación solo conserva el mes en curso y el anterior. El día 15 de cada
 * mes se elimina el mes que queda fuera de esa ventana. Ejemplo:
 *   - 1–14 de diciembre: se conservan octubre, noviembre y diciembre.
 *   - A partir del 15 de diciembre: se elimina octubre; quedan noviembre y diciembre.
 */

export const TIME_ZONE = "Europe/Madrid";
export const PURGE_DAY = 15;

/** Mes en formato "YYYY-MM". */
export type MonthKey = string;

export type Retention = {
  /** Fecha de hoy (zona horaria de la app) en formato "YYYY-MM-DD". */
  today: string;
  currentMonth: MonthKey;
  /** Meses disponibles, del más antiguo al más reciente. */
  months: MonthKey[];
  /** Primer día conservado. Todo lo anterior se elimina. */
  cutoffDate: string;
  /** Último día en el que se pueden registrar gastos (fin del mes en curso). */
  maxDate: string;
  /** Próxima fecha de borrado automático. */
  nextPurgeDate: string;
  /** Mes que se eliminará en la próxima fecha de borrado. */
  monthToPurge: MonthKey;
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
  const day = Number(today.slice(8, 10));

  const monthsBack = day >= PURGE_DAY ? 1 : 2;
  const months: MonthKey[] = [];
  for (let i = monthsBack; i >= 0; i--) months.push(shiftMonth(currentMonth, -i));

  const oldest = months[0];
  const nextPurgeMonth = day >= PURGE_DAY ? shiftMonth(currentMonth, 1) : currentMonth;

  return {
    today,
    currentMonth,
    months,
    cutoffDate: `${oldest}-01`,
    maxDate: lastDayOfMonth(currentMonth),
    nextPurgeDate: `${nextPurgeMonth}-${String(PURGE_DAY).padStart(2, "0")}`,
    monthToPurge: oldest,
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

export function formatDate(date: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(
    "es-ES",
    style === "long"
      ? { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
      : { day: "2-digit", month: "short", timeZone: "UTC" },
  ).format(new Date(Date.UTC(y, m - 1, d)));
}
