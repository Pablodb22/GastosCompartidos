import { beneficiaryOf, summarize, type Expense } from "./calc";
import type { PersonId, Section } from "./config";
import { lastDayOfMonth, shiftMonth, type MonthKey } from "./periods";

/**
 * Datos para la sección de gráficos. Todo se calcula sobre «la parte» de cada
 * persona (lo que realmente le cuesta tras el reparto), no sobre quién adelantó
 * el dinero.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parte de un gasto que le corresponde a una persona. */
export function shareOf(e: Expense, p: PersonId): number {
  const share1 = (e.importe * e.porcentaje1) / 100;
  return p === 1 ? share1 : e.importe - share1;
}

// ---------- Categorías del desglose personal ----------

export type CategoryKey = "alquiler" | "internet" | "agua" | "luz" | "comida" | "ocioPareja" | "ocioIndividual";

export const CATEGORIES: Record<CategoryKey, { label: string; emoji: string }> = {
  alquiler: { label: "Alquiler", emoji: "🏠" },
  internet: { label: "Internet", emoji: "📶" },
  agua: { label: "Agua", emoji: "💧" },
  luz: { label: "Luz", emoji: "💡" },
  comida: { label: "Comida", emoji: "🛒" },
  ocioPareja: { label: "Ocio en pareja", emoji: "💑" },
  ocioIndividual: { label: "Ocio individual", emoji: "🙋" },
};

function categoryOf(e: Expense): CategoryKey {
  if (e.seccion === "fijos") {
    const k = e.concepto.toLowerCase();
    return k === "alquiler" || k === "internet" || k === "agua" || k === "luz" ? k : "alquiler";
  }
  if (e.seccion === "comida") return "comida";
  return beneficiaryOf(e) === "pareja" ? "ocioPareja" : "ocioIndividual";
}

// ---------- Utilidades de fechas ----------

const daysIn = (month: MonthKey) => Number(lastDayOfMonth(month).slice(8, 10));
const inMonth = (expenses: Expense[], month: MonthKey) => expenses.filter((e) => e.fecha.startsWith(month));

/** Días transcurridos del mes: hasta hoy si es el mes en curso, el mes entero si ya pasó. */
function elapsedDays(month: MonthKey, today: string): number {
  if (today.startsWith(month)) return Number(today.slice(8, 10));
  return daysIn(month);
}

function cumulative(expenses: Expense[], month: MonthKey, valueOf: (e: Expense) => number, upTo: number): number[] {
  const perDay = new Array<number>(daysIn(month)).fill(0);
  for (const e of inMonth(expenses, month)) perDay[Number(e.fecha.slice(8, 10)) - 1] += valueOf(e);
  let acc = 0;
  return perDay.slice(0, upTo).map((v) => (acc = round2(acc + v)));
}

// ---------- Por persona ----------

export type CategoryRow = {
  key: CategoryKey;
  amount: number;
  count: number;
  /** Lo mismo en el mes anterior (null si ese mes ya no se conserva). */
  prev: number | null;
  /** Porcentaje sobre el gasto total de la persona en el mes. */
  pct: number;
};

export type TopExpense = {
  id: number;
  fecha: string;
  concepto: string;
  seccion: Section;
  share: number;
  importe: number;
  pagadoPor: PersonId;
  individual: boolean;
};

export type PersonStats = {
  person: PersonId;
  total: number;
  prevTotal: number | null;
  /** Mes en curso: lo que llevaba el mes anterior a estas alturas (para comparar justo). */
  prevSameDay: number | null;
  /** Días del mes que se están comparando (todo el mes si ya terminó). */
  elapsed: number;
  paid: number;
  /** Gastos del mes que pagó esta persona. */
  paidCount: number;
  /** Positivo: le deben. Negativo: debe. Solo lo pendiente. */
  pending: number;
  dailyAvg: number;
  count: number;
  categories: CategoryRow[];
  /** Gasto acumulado día a día (su parte). */
  cumulative: number[];
  prevCumulative: number[] | null;
  daysInMonth: number;
  top: TopExpense[];
};

export function personStats(
  all: Expense[],
  month: MonthKey,
  p: PersonId,
  opts: { today: string; prevAvailable: boolean },
): PersonStats {
  const prevMonth = shiftMonth(month, -1);
  const cur = inMonth(all, month).filter((e) => shareOf(e, p) > 0.004);
  const prev = opts.prevAvailable ? inMonth(all, prevMonth).filter((e) => shareOf(e, p) > 0.004) : null;
  const overall = summarize(inMonth(all, month)).overall;

  const sumBy = (list: Expense[]) => {
    const m = new Map<CategoryKey, { amount: number; count: number }>();
    for (const e of list) {
      const k = categoryOf(e);
      const row = m.get(k) ?? { amount: 0, count: 0 };
      row.amount += shareOf(e, p);
      row.count += 1;
      m.set(k, row);
    }
    return m;
  };
  const curBy = sumBy(cur);
  const prevBy = prev ? sumBy(prev) : null;

  const total = round2(cur.reduce((a, e) => a + shareOf(e, p), 0));
  const prevTotal = prev ? round2(prev.reduce((a, e) => a + shareOf(e, p), 0)) : null;

  const keys = new Set<CategoryKey>([...curBy.keys(), ...(prevBy?.keys() ?? [])]);
  const categories = [...keys]
    .map((key) => {
      const c = curBy.get(key);
      const amount = round2(c?.amount ?? 0);
      return {
        key,
        amount,
        count: c?.count ?? 0,
        prev: prevBy ? round2(prevBy.get(key)?.amount ?? 0) : null,
        pct: total > 0 ? (amount / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount || (b.prev ?? 0) - (a.prev ?? 0));

  const elapsed = elapsedDays(month, opts.today);
  const balance = overall.balance; // Positivo: la persona 2 debe a la 1.

  const prevCumulative = prev ? cumulative(prev, prevMonth, (e) => shareOf(e, p), daysIn(prevMonth)) : null;
  const ongoing = opts.today.startsWith(month);

  return {
    person: p,
    total,
    prevTotal,
    prevSameDay: prevCumulative && ongoing ? (prevCumulative[Math.min(elapsed, prevCumulative.length) - 1] ?? 0) : null,
    elapsed,
    paid: overall.paidBy[p],
    paidCount: inMonth(all, month).filter((e) => e.pagadoPor === p).length,
    pending: p === 1 ? balance : -balance,
    dailyAvg: round2(total / Math.max(1, elapsed)),
    count: cur.length,
    categories,
    cumulative: cumulative(cur, month, (e) => shareOf(e, p), elapsed),
    prevCumulative,
    daysInMonth: daysIn(month),
    top: cur
      .map((e) => ({
        id: e.id,
        fecha: e.fecha,
        concepto: e.concepto,
        seccion: e.seccion,
        share: round2(shareOf(e, p)),
        importe: e.importe,
        pagadoPor: e.pagadoPor,
        individual: beneficiaryOf(e) !== "pareja",
      }))
      .sort((a, b) => b.share - a.share || b.fecha.localeCompare(a.fecha))
      .slice(0, 5),
  };
}

// ---------- Pareja (solo gastos comunes) ----------

export type CoupleMonth = { month: MonthKey; fijos: number; comida: number; ocio: number; total: number };

export type CoupleStats = {
  months: CoupleMonth[];
  current: CoupleMonth;
  prev: CoupleMonth | null;
  /** Quién ha adelantado el dinero de los gastos comunes del mes. */
  paidBy: Record<PersonId, number>;
  count: number;
  dailyAvg: number;
  /** Mes en curso: gasto común del mes anterior hasta el mismo día. */
  prevSameDay: number | null;
  elapsed: number;
};

/** Gastos comunes: los fijos, la comida y el ocio en pareja (no el ocio individual). */
const isShared = (e: Expense) => beneficiaryOf(e) === "pareja";

function coupleMonth(all: Expense[], month: MonthKey): CoupleMonth {
  const m: CoupleMonth = { month, fijos: 0, comida: 0, ocio: 0, total: 0 };
  for (const e of inMonth(all, month).filter(isShared)) {
    m[e.seccion] += e.importe;
    m.total += e.importe;
  }
  return { month, fijos: round2(m.fijos), comida: round2(m.comida), ocio: round2(m.ocio), total: round2(m.total) };
}

export function coupleStats(all: Expense[], months: MonthKey[], month: MonthKey, today: string): CoupleStats {
  const series = months.map((m) => coupleMonth(all, m));
  const current = series.find((s) => s.month === month) ?? coupleMonth(all, month);
  const prevKey = shiftMonth(month, -1);
  const shared = inMonth(all, month).filter(isShared);
  const paidBy: Record<PersonId, number> = { 1: 0, 2: 0 };
  for (const e of shared) paidBy[e.pagadoPor] += e.importe;
  const elapsed = elapsedDays(month, today);
  const prev = series.find((s) => s.month === prevKey) ?? null;
  const prevCum = prev ? cumulative(all.filter(isShared), prevKey, (e) => e.importe, daysIn(prevKey)) : null;
  return {
    months: series,
    current,
    prev,
    prevSameDay: prevCum && today.startsWith(month) ? (prevCum[Math.min(elapsed, prevCum.length) - 1] ?? 0) : null,
    elapsed,
    paidBy: { 1: round2(paidBy[1]), 2: round2(paidBy[2]) },
    count: shared.length,
    dailyAvg: round2(current.total / Math.max(1, elapsed)),
  };
}
