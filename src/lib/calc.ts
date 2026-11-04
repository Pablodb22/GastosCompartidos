import type { PersonId, Section } from "./config";

export type Expense = {
  id: number;
  fecha: string;
  seccion: Section;
  concepto: string;
  importe: number;
  pagadoPor: PersonId;
  /** Porcentaje del gasto que corresponde a la persona 1 (50 o proporcional al sueldo). */
  porcentaje1: number;
  /** La otra persona ya ha devuelto su parte. El gasto se conserva, pero deja de contar como deuda. */
  saldado: boolean;
  /** Productos del ticket, si el gasto se creó escaneándolo. */
  productos?: Product[];
};

export type Product = { nombre: string; importe: number };

export type Totals = {
  total: number;
  count: number;
  paidBy: Record<PersonId, number>;
  /** Lo que realmente le corresponde pagar a cada persona tras el reparto. */
  costFor: Record<PersonId, number>;
  /** Pendiente de pagar. Positivo: la persona 2 debe a la persona 1. Negativo: al revés. */
  balance: number;
  /** Importe de las deudas que ya se han pagado. */
  settled: number;
  /** Gastos que aún generan deuda. */
  pendingCount: number;
};

export type MonthSummary = {
  overall: Totals;
  bySection: Record<Section, Totals>;
};

/** Para quién es un gasto: de la pareja (se reparte) o individual de una persona. */
export type Beneficiary = "pareja" | PersonId;

/** El ocio puede ser individual: el 100 % corresponde a una sola persona. */
export function beneficiaryOf(e: Pick<Expense, "seccion" | "porcentaje1">): Beneficiary {
  if (e.seccion === "ocio") {
    if (e.porcentaje1 >= 100) return 1;
    if (e.porcentaje1 <= 0) return 2;
  }
  return "pareja";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const empty = (): Totals => ({
  total: 0,
  count: 0,
  paidBy: { 1: 0, 2: 0 },
  costFor: { 1: 0, 2: 0 },
  balance: 0,
  settled: 0,
  pendingCount: 0,
});

/** Parte que la otra persona le debe a quien pagó (0 si no genera deuda). */
export function owedAmount(e: Pick<Expense, "importe" | "porcentaje1" | "pagadoPor">): number {
  const share1 = (e.importe * e.porcentaje1) / 100;
  return round2(e.pagadoPor === 1 ? e.importe - share1 : share1);
}

function add(t: Totals, e: Expense) {
  const share1 = (e.importe * e.porcentaje1) / 100;
  const share2 = e.importe - share1;
  t.total += e.importe;
  t.count += 1;
  t.paidBy[e.pagadoPor] += e.importe;
  t.costFor[1] += share1;
  t.costFor[2] += share2;
  // Quien paga adelanta la parte de la otra persona, salvo que ya se la hayan devuelto.
  const owed = e.pagadoPor === 1 ? share2 : share1;
  if (owed <= 0.004) return;
  if (e.saldado) {
    t.settled += owed;
  } else {
    t.balance += e.pagadoPor === 1 ? owed : -owed;
    t.pendingCount += 1;
  }
}

function rounded(t: Totals): Totals {
  return {
    total: round2(t.total),
    count: t.count,
    paidBy: { 1: round2(t.paidBy[1]), 2: round2(t.paidBy[2]) },
    costFor: { 1: round2(t.costFor[1]), 2: round2(t.costFor[2]) },
    balance: round2(t.balance),
    settled: round2(t.settled),
    pendingCount: t.pendingCount,
  };
}

export function summarize(expenses: Expense[]): MonthSummary {
  const overall = empty();
  const bySection: Record<Section, Totals> = { fijos: empty(), comida: empty(), ocio: empty() };
  for (const e of expenses) {
    add(overall, e);
    add(bySection[e.seccion], e);
  }
  return {
    overall: rounded(overall),
    bySection: {
      fijos: rounded(bySection.fijos),
      comida: rounded(bySection.comida),
      ocio: rounded(bySection.ocio),
    },
  };
}

/** Porcentaje del alquiler que corresponde a la persona 1 según los sueldos, o null si faltan datos. */
export function rentPercent(salaries: Record<PersonId, number | null>): number | null {
  const [s1, s2] = [salaries[1], salaries[2]];
  if (s1 === null || s2 === null || s1 + s2 <= 0) return null;
  return round2((s1 / (s1 + s2)) * 100);
}

/** Convierte un importe escrito en formato español ("1.234,56", "45,9", "30 €") a número. */
export function parseAmount(input: string): number | null {
  const normalized = input
    .replace(/\s|€/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n < 100_000_000 ? n : null;
}

const currency = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const formatEUR = (n: number) => currency.format(n);

const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
export const formatPct = (n: number) => `${pct.format(n)} %`;
