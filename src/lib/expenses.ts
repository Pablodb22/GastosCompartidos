import "server-only";
import { db } from "./db";
import type { Expense } from "./calc";
import type { PersonId, Section } from "./config";
import { shiftMonth, type MonthKey, type Retention } from "./periods";

// ---------- Pareja ----------

export type Couple = {
  names: Record<PersonId, string>;
  salaries: Record<PersonId, number | null>;
  configured: boolean;
};

export async function getCouple(): Promise<Couple> {
  const sql = await db();
  const rows = (await sql`
    SELECT nombre_1, nombre_2, sueldo_1::float8 AS sueldo_1, sueldo_2::float8 AS sueldo_2
    FROM pareja WHERE id = 1
  `) as { nombre_1: string; nombre_2: string; sueldo_1: number | null; sueldo_2: number | null }[];
  const r = rows[0];
  if (!r) {
    return { names: { 1: "Persona 1", 2: "Persona 2" }, salaries: { 1: null, 2: null }, configured: false };
  }
  return {
    names: { 1: r.nombre_1, 2: r.nombre_2 },
    salaries: {
      1: r.sueldo_1 === null ? null : Number(r.sueldo_1),
      2: r.sueldo_2 === null ? null : Number(r.sueldo_2),
    },
    configured: true,
  };
}

export async function saveCouple(c: { names: Record<PersonId, string>; salaries: Record<PersonId, number> }) {
  const sql = await db();
  await sql`
    INSERT INTO pareja (id, nombre_1, nombre_2, sueldo_1, sueldo_2)
    VALUES (1, ${c.names[1]}, ${c.names[2]}, ${c.salaries[1]}, ${c.salaries[2]})
    ON CONFLICT (id) DO UPDATE SET
      nombre_1 = EXCLUDED.nombre_1, nombre_2 = EXCLUDED.nombre_2,
      sueldo_1 = EXCLUDED.sueldo_1, sueldo_2 = EXCLUDED.sueldo_2,
      actualizado_en = now()
  `;
}

// ---------- Gastos ----------

type Row = {
  id: string | number;
  fecha: string;
  seccion: string;
  concepto: string;
  importe: number | string;
  pagado_por: number;
  porcentaje_1: number | string;
};

const toExpense = (r: Row): Expense => ({
  id: Number(r.id),
  fecha: r.fecha,
  seccion: r.seccion as Section,
  concepto: r.concepto,
  importe: Number(r.importe),
  pagadoPor: r.pagado_por as PersonId,
  porcentaje1: Number(r.porcentaje_1),
});

export async function listExpenses(month: MonthKey): Promise<Expense[]> {
  const sql = await db();
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  const rows = (await sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, seccion, concepto,
           importe::float8 AS importe, pagado_por, porcentaje_1::float8 AS porcentaje_1
    FROM gastos
    WHERE fecha >= ${from}::date AND fecha < ${to}::date
    ORDER BY fecha DESC, id DESC
  `) as Row[];
  return rows.map(toExpense);
}

export async function insertExpense(e: Omit<Expense, "id">): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO gastos (fecha, seccion, concepto, importe, pagado_por, porcentaje_1)
    VALUES (${e.fecha}::date, ${e.seccion}, ${e.concepto}, ${e.importe}, ${e.pagadoPor}, ${e.porcentaje1})
  `;
}

export async function removeExpense(id: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM gastos WHERE id = ${id}`;
}

/** Elimina todos los gastos anteriores a la fecha de corte. Es idempotente. */
export async function purgeExpired(retention: Retention): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM gastos WHERE fecha < ${retention.cutoffDate}::date RETURNING id
  `) as { id: string }[];
  return rows.length;
}
