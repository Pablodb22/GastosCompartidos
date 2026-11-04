import { beneficiaryOf, type Expense } from "./calc";
import type { PersonId } from "./config";
import type { MonthKey } from "./periods";

/**
 * Datos de los quesitos de la sección «Gráficos».
 *  - Por persona: su parte de cada gasto (lo que le toca tras el reparto).
 *  - Pareja: solo los gastos comunes (el ocio individual no cuenta).
 * El ocio se divide por concepto («Cine», «Cena japonés»…).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parte de un gasto que le corresponde a una persona. */
export function shareOf(e: Expense, p: PersonId): number {
  const share1 = (e.importe * e.porcentaje1) / 100;
  return p === 1 ? share1 : e.importe - share1;
}

export type SliceGroup = "fijos" | "comida" | "ocio";

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  group: SliceGroup;
  /** Número de gastos que forman la porción. */
  count: number;
};

export type PieData = { total: number; slices: PieSlice[]; ocioTotal: number };

/** Como máximo 4 porciones de ocio; el resto se agrupa en «Otro ocio» para que el quesito se lea. */
export const MAX_OCIO_SLICES = 4;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function pieFor(all: Expense[], month: MonthKey, who: PersonId | "pareja"): PieData {
  const valueOf = (e: Expense) => (who === "pareja" ? e.importe : shareOf(e, who));
  const list = all
    .filter((e) => e.fecha.startsWith(month))
    .filter((e) => (who === "pareja" ? beneficiaryOf(e) === "pareja" : shareOf(e, who) > 0.004));

  const fijos = { value: 0, count: 0 };
  const comida = { value: 0, count: 0 };
  const ocio = new Map<string, { label: string; value: number; count: number }>();

  for (const e of list) {
    const v = valueOf(e);
    if (e.seccion === "fijos") {
      fijos.value += v;
      fijos.count++;
    } else if (e.seccion === "comida") {
      comida.value += v;
      comida.count++;
    } else {
      // «Cine», «cine » y «CINE» son el mismo concepto; se muestra como se escribió la primera vez.
      const k = normalize(e.concepto);
      const name = e.concepto.trim();
      const row = ocio.get(k) ?? { label: name.charAt(0).toUpperCase() + name.slice(1), value: 0, count: 0 };
      row.value += v;
      row.count++;
      ocio.set(k, row);
    }
  }

  const slices: PieSlice[] = [];
  if (fijos.value > 0) slices.push({ key: "fijos", label: "Gastos fijos", value: round2(fijos.value), group: "fijos", count: fijos.count });
  if (comida.value > 0) slices.push({ key: "comida", label: "Comida", value: round2(comida.value), group: "comida", count: comida.count });

  const ocioRows = [...ocio.entries()]
    .map(([k, r]) => ({ key: `ocio:${k}`, label: r.label, value: round2(r.value), group: "ocio" as const, count: r.count }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  if (ocioRows.length > MAX_OCIO_SLICES) {
    const rest = ocioRows.slice(MAX_OCIO_SLICES);
    slices.push(...ocioRows.slice(0, MAX_OCIO_SLICES), {
      key: "ocio:otros",
      label: `Otro ocio (${rest.length === 1 ? "1 plan" : `${rest.length} planes`})`,
      value: round2(rest.reduce((a, r) => a + r.value, 0)),
      group: "ocio",
      count: rest.reduce((a, r) => a + r.count, 0),
    });
  } else {
    slices.push(...ocioRows);
  }

  return {
    total: round2(slices.reduce((a, s) => a + s.value, 0)),
    ocioTotal: round2(slices.filter((s) => s.group === "ocio").reduce((a, s) => a + s.value, 0)),
    slices,
  };
}
