import { beneficiaryOf, summarize, type Expense } from "./calc";
import { GYM, RENT, type PersonId, type Section } from "./config";
import { lastDayOfMonth, shiftMonth, type MonthKey } from "./periods";
import { shareOf } from "./stats";

/**
 * Estadísticas del «Wrapped» anual. Función pura (sin base de datos ni
 * navegador): recibe los gastos y devuelve un resumen que se guarda tal cual
 * (JSON), para poder volver a verlo aunque los gastos antiguos se borren.
 *
 * El periodo es del 1 de enero al 30 de noviembre (como hace Spotify): el 1 de
 * diciembre se genera y se guarda. La vista previa usa los datos hasta hoy.
 */

export const WRAPPED_VERSION = 1;

/** Último día del periodo de un Wrapped definitivo. */
export const wrappedEnd = (year: number) => `${year}-11-30`;
/** Día en que se desbloquea el Wrapped de un año. */
export const wrappedUnlockDate = (year: number) => `${year}-12-01`;
/** ¿Ya se puede ver el Wrapped definitivo de ese año? (desde el 1 de diciembre) */
export const isWrappedUnlocked = (year: number, today: string) => today >= wrappedUnlockDate(year);

export type RecordItem = { concept: string; date: string; amount: number };
export type RankedItem = { name: string; times: number; total: number };
export type CategoryKey = "comida" | "ocioPareja" | "ocioPropio" | "gimnasio";

export type PersonStats = {
  /** Su parte de todos los gastos (lo que le toca tras el reparto). */
  share: number;
  /** Lo que más le gusta gastar (sin contar alquiler ni facturas). */
  top: { key: CategoryKey; amount: number } | null;
  /** Gastos solo suyos: ocio individual y gimnasio propio. */
  own: number;
  /** Su capricho más caro. */
  ownTop: { name: string; amount: number } | null;
};

export type WrappedData = {
  v: number;
  year: number;
  /** Primer día con gastos dentro del periodo. */
  from: string;
  /** Último día del periodo. */
  to: string;
  preview: boolean;
  names: Record<PersonId, string>;
  count: number;
  total: number;
  bySection: Record<Section, number>;
  coverageMonths: number;
  /** Desde el primer mes con datos hasta el último del periodo. */
  months: { month: MonthKey; total: number; complete: boolean }[];
  /** Compras y ocio por día de la semana, de lunes a domingo. */
  weekdays: { spend: number; count: number }[];
  starDay: { date: string; amount: number; concepts: string[] } | null;
  merchants: (RankedItem & { visits: number })[];
  plans: RankedItem[];
  products: RankedItem[];
  productStats: { distinct: number; lines: number };
  records: { shop: RecordItem | null; ocio: RecordItem | null };
  paidBy: Record<PersonId, number>;
  paidCount: Record<PersonId, number>;
  people: Record<PersonId, PersonStats>;
  /** Positivo: la persona 2 debe a la 1. Negativo: al revés. */
  pending: { balance: number; count: number; settled: number };
  streak: { days: number; from: string; to: string } | null;
  prev: { year: number; total: number; coverageMonths: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const utcMs = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Día de la semana de una fecha: 0 = lunes … 6 = domingo. */
export const weekdayOf = (iso: string) => (new Date(utcMs(iso)).getUTCDay() + 6) % 7;

/** Agrupa por nombre normalizado y se queda con el nombre escrito con más frecuencia. */
function groupBy<T>(rows: T[], nameOf: (r: T) => string, qtyOf: (r: T) => number, valueOf: (r: T) => number) {
  const groups = new Map<string, { names: Map<string, number>; times: number; total: number }>();
  for (const r of rows) {
    const raw = nameOf(r).trim();
    const key = normalize(raw);
    if (!key) continue;
    const g = groups.get(key) ?? { names: new Map(), times: 0, total: 0 };
    g.names.set(raw, (g.names.get(raw) ?? 0) + 1);
    g.times += qtyOf(r);
    g.total += valueOf(r);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { name: capitalize(name), times: g.times, total: round2(g.total) };
  });
}

/** Nombre de producto sin la cantidad del principio («2 × Pan barra» → 2 y «Pan barra»). */
function splitQuantity(name: string): { qty: number; name: string } {
  const m = name.match(/^(\d{1,2})\s*[×x]\s+(.+)$/i);
  return m ? { qty: Number(m[1]), name: m[2] } : { qty: 1, name };
}

function categoryOf(e: Expense): "alquiler" | "suministros" | CategoryKey {
  if (e.seccion === "fijos") {
    if (e.concepto === RENT) return "alquiler";
    if (e.concepto === GYM) return "gimnasio";
    return "suministros";
  }
  if (e.seccion === "comida") return "comida";
  return beneficiaryOf(e) === "pareja" ? "ocioPareja" : "ocioPropio";
}

/** Resumen mínimo de un periodo, para comparar con el año anterior. */
export function periodSummary(expenses: Expense[]): { total: number; coverageMonths: number } {
  const months = new Set(expenses.map((e) => e.fecha.slice(0, 7)));
  return { total: round2(expenses.reduce((a, e) => a + e.importe, 0)), coverageMonths: months.size };
}

export function buildWrapped(
  all: Expense[],
  opts: {
    year: number;
    names: Record<PersonId, string>;
    /** Último día del periodo («YYYY-MM-DD»). */
    to: string;
    preview: boolean;
    prev?: { year: number; total: number; coverageMonths: number } | null;
  },
): WrappedData | null {
  const { year, names, to, preview } = opts;
  const list = all.filter((e) => e.fecha >= `${year}-01-01` && e.fecha <= to);
  if (list.length === 0) return null;

  const from = list.reduce((min, e) => (e.fecha < min ? e.fecha : min), list[0].fecha);
  const total = round2(list.reduce((a, e) => a + e.importe, 0));

  const bySection: Record<Section, number> = { fijos: 0, comida: 0, ocio: 0 };
  for (const e of list) bySection[e.seccion] += e.importe;
  for (const k of Object.keys(bySection) as Section[]) bySection[k] = round2(bySection[k]);

  // ---- Meses (desde el primero con datos hasta el último del periodo) ----
  const perMonth = new Map<MonthKey, number>();
  for (const e of list) perMonth.set(e.fecha.slice(0, 7), (perMonth.get(e.fecha.slice(0, 7)) ?? 0) + e.importe);
  const toMonth = to.slice(0, 7);
  const toIsMonthEnd = to === lastDayOfMonth(toMonth);
  const months: WrappedData["months"] = [];
  for (let m = from.slice(0, 7); m <= toMonth; m = shiftMonth(m, 1)) {
    months.push({ month: m, total: round2(perMonth.get(m) ?? 0), complete: m < toMonth || toIsMonthEnd });
  }

  // ---- Día de la semana y día estrella (solo compras y ocio: los fijos caen siempre en los mismos días) ----
  const flexible = list.filter((e) => e.seccion !== "fijos");
  const weekdays = Array.from({ length: 7 }, () => ({ spend: 0, count: 0 }));
  const perDay = new Map<string, { amount: number; items: Expense[] }>();
  for (const e of flexible) {
    const w = weekdays[weekdayOf(e.fecha)];
    w.spend += e.importe;
    w.count += 1;
    const d = perDay.get(e.fecha) ?? { amount: 0, items: [] };
    d.amount += e.importe;
    d.items.push(e);
    perDay.set(e.fecha, d);
  }
  for (const w of weekdays) w.spend = round2(w.spend);

  let starDay: WrappedData["starDay"] = null;
  for (const [date, d] of perDay) {
    if (!starDay || d.amount > starDay.amount) {
      starDay = {
        date,
        amount: round2(d.amount),
        concepts: [...d.items]
          .sort((a, b) => b.importe - a.importe)
          .map((e) => capitalize(e.concepto.trim()))
          .filter((c, i, arr) => arr.indexOf(c) === i)
          .slice(0, 3),
      };
    }
  }

  // ---- Sitios, planes y productos ----
  const merchants = groupBy(
    list.filter((e) => e.seccion === "comida"),
    (e) => e.concepto,
    () => 1,
    (e) => e.importe,
  )
    .map((g) => ({ ...g, visits: g.times }))
    .sort((a, b) => b.visits - a.visits || b.total - a.total)
    .slice(0, 5);

  const plans = groupBy(
    list.filter((e) => e.seccion === "ocio" && beneficiaryOf(e) === "pareja"),
    (e) => e.concepto,
    () => 1,
    (e) => e.importe,
  )
    .sort((a, b) => b.total - a.total || b.times - a.times)
    .slice(0, 5);

  const lines = list.flatMap((e) => e.productos ?? []).map((p) => ({ ...splitQuantity(p.nombre), price: p.importe }));
  const productGroups = groupBy(
    lines,
    (l) => l.name,
    (l) => l.qty,
    (l) => l.price,
  );
  const products = [...productGroups].sort((a, b) => b.times - a.times || b.total - a.total).slice(0, 5);

  // ---- Récords ----
  const record = (section: Section): RecordItem | null => {
    const best = list.filter((e) => e.seccion === section).sort((a, b) => b.importe - a.importe)[0];
    return best ? { concept: capitalize(best.concepto.trim()), date: best.fecha, amount: round2(best.importe) } : null;
  };

  // ---- Quién pagó ----
  const paidBy: Record<PersonId, number> = { 1: 0, 2: 0 };
  const paidCount: Record<PersonId, number> = { 1: 0, 2: 0 };
  for (const e of list) {
    paidBy[e.pagadoPor] += e.importe;
    paidCount[e.pagadoPor] += 1;
  }

  // ---- Por persona ----
  const people = {} as Record<PersonId, PersonStats>;
  for (const p of [1, 2] as const) {
    const cats = new Map<CategoryKey, number>();
    let share = 0;
    let own = 0;
    let ownTop: PersonStats["ownTop"] = null;
    for (const e of list) {
      const s = shareOf(e, p);
      if (s <= 0.004) continue;
      share += s;
      const c = categoryOf(e);
      if (c !== "alquiler" && c !== "suministros") cats.set(c, (cats.get(c) ?? 0) + s);
      if (beneficiaryOf(e) === p) {
        own += s;
        if (!ownTop || s > ownTop.amount) ownTop = { name: capitalize(e.concepto.trim()), amount: round2(s) };
      }
    }
    const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    people[p] = {
      share: round2(share),
      top: topCat ? { key: topCat[0], amount: round2(topCat[1]) } : null,
      own: round2(own),
      ownTop,
    };
  }

  // ---- Deuda pendiente ----
  const overall = summarize(list).overall;

  // ---- Racha más larga sin gastar nada ----
  // Solo entre el primer y el último gasto apuntados: después de eso no se sabe si no gastasteis
  // o si simplemente dejasteis de apuntar.
  const spendDays = new Set(list.map((e) => e.fecha));
  const lastSpend = list.reduce((max, e) => (e.fecha > max ? e.fecha : max), list[0].fecha);
  let streak: WrappedData["streak"] = null;
  let run = 0;
  let runStart = "";
  for (let ms = utcMs(from); ms <= utcMs(lastSpend); ms += 86_400_000) {
    const d = isoOf(ms);
    if (spendDays.has(d)) {
      run = 0;
      continue;
    }
    if (run === 0) runStart = d;
    run++;
    if (!streak || run > streak.days) streak = { days: run, from: runStart, to: d };
  }

  return {
    v: WRAPPED_VERSION,
    year,
    from,
    to,
    preview,
    names,
    count: list.length,
    total,
    bySection,
    coverageMonths: perMonth.size,
    months,
    weekdays,
    starDay,
    merchants,
    plans,
    products,
    productStats: { distinct: productGroups.length, lines: lines.length },
    records: { shop: record("comida"), ocio: record("ocio") },
    paidBy: { 1: round2(paidBy[1]), 2: round2(paidBy[2]) },
    paidCount,
    people,
    pending: { balance: overall.balance, count: overall.pendingCount, settled: overall.settled },
    streak,
    prev: opts.prev ?? null,
  };
}
