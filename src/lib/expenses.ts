import "server-only";
import { db } from "./db";
import type { Expense } from "./calc";
import type { PersonId, Section } from "./config";
import { shiftMonth, type MonthKey, type Retention } from "./periods";
import { buildWrapped, isWrappedUnlocked, periodSummary, wrappedEnd, type WrappedData } from "./wrapped";

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
  saldado: boolean;
  productos?: { nombre: string; importe: number | string }[] | null;
};

const toExpense = (r: Row): Expense => ({
  id: Number(r.id),
  fecha: r.fecha,
  seccion: r.seccion as Section,
  concepto: r.concepto,
  importe: Number(r.importe),
  pagadoPor: r.pagado_por as PersonId,
  porcentaje1: Number(r.porcentaje_1),
  saldado: Boolean(r.saldado),
  ...(r.productos?.length
    ? { productos: r.productos.map((p) => ({ nombre: p.nombre, importe: Number(p.importe) })) }
    : {}),
});

export async function listExpenses(month: MonthKey): Promise<Expense[]> {
  const sql = await db();
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  const rows = (await sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, seccion, concepto,
           importe::float8 AS importe, pagado_por, porcentaje_1::float8 AS porcentaje_1, saldado,
           (SELECT json_agg(json_build_object('nombre', p.nombre, 'importe', p.importe::float8) ORDER BY p.orden)
              FROM gasto_productos p WHERE p.gasto_id = g.id) AS productos
    FROM gastos g
    WHERE fecha >= ${from}::date AND fecha < ${to}::date
    ORDER BY fecha DESC, id DESC
  `) as Row[];
  return rows.map(toExpense);
}

/** Meses ("YYYY-MM") que tienen al menos un gasto, para marcarlos en el selector. */
export async function listMonthsWithData(): Promise<MonthKey[]> {
  const sql = await db();
  const rows = (await sql`SELECT DISTINCT to_char(fecha, 'YYYY-MM') AS m FROM gastos ORDER BY m`) as { m: string }[];
  return rows.map((r) => r.m);
}

/** Un gasto con sus productos, o null si no existe. */
export async function getExpense(id: number): Promise<Expense | null> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, seccion, concepto,
           importe::float8 AS importe, pagado_por, porcentaje_1::float8 AS porcentaje_1, saldado,
           (SELECT json_agg(json_build_object('nombre', p.nombre, 'importe', p.importe::float8) ORDER BY p.orden)
              FROM gasto_productos p WHERE p.gasto_id = g.id) AS productos
    FROM gastos g
    WHERE id = ${id}
  `) as Row[];
  return rows[0] ? toExpense(rows[0]) : null;
}

/**
 * Actualiza un gasto y sustituye su lista de productos, todo en una sola
 * sentencia (o se guarda todo o nada). Devuelve false si el gasto ya no existe.
 */
export async function updateExpense(e: Expense): Promise<boolean> {
  const sql = await db();
  const productos = JSON.stringify(
    (e.productos ?? []).map((p, i) => ({ orden: i + 1, nombre: p.nombre, importe: p.importe })),
  );
  const rows = (await sql`
    WITH u AS (
      UPDATE gastos SET
        fecha = ${e.fecha}::date, seccion = ${e.seccion}, concepto = ${e.concepto}, importe = ${e.importe},
        pagado_por = ${e.pagadoPor}, porcentaje_1 = ${e.porcentaje1}, saldado = ${e.saldado},
        saldado_en = CASE WHEN ${e.saldado} THEN COALESCE(saldado_en, now()) END
      WHERE id = ${e.id}
      RETURNING id
    ),
    borrados AS (DELETE FROM gasto_productos WHERE gasto_id IN (SELECT id FROM u)),
    nuevos AS (
      INSERT INTO gasto_productos (gasto_id, orden, nombre, importe)
      SELECT u.id, x.orden, x.nombre, x.importe
      FROM u, jsonb_to_recordset(${productos}::jsonb) AS x(orden smallint, nombre text, importe numeric)
    )
    SELECT id FROM u
  `) as { id: string }[];
  return rows.length > 0;
}

export async function insertExpense(e: Omit<Expense, "id">): Promise<void> {
  const sql = await db();
  if (!e.productos?.length) {
    await sql`
      INSERT INTO gastos (fecha, seccion, concepto, importe, pagado_por, porcentaje_1, saldado, saldado_en)
      VALUES (${e.fecha}::date, ${e.seccion}, ${e.concepto}, ${e.importe}, ${e.pagadoPor}, ${e.porcentaje1},
              ${e.saldado}, CASE WHEN ${e.saldado} THEN now() END)
    `;
    return;
  }
  // Gasto y productos en una sola sentencia: o se guarda todo o nada.
  const productos = JSON.stringify(e.productos.map((p, i) => ({ orden: i + 1, nombre: p.nombre, importe: p.importe })));
  await sql`
    WITH g AS (
      INSERT INTO gastos (fecha, seccion, concepto, importe, pagado_por, porcentaje_1, saldado, saldado_en)
      VALUES (${e.fecha}::date, ${e.seccion}, ${e.concepto}, ${e.importe}, ${e.pagadoPor}, ${e.porcentaje1},
              ${e.saldado}, CASE WHEN ${e.saldado} THEN now() END)
      RETURNING id
    )
    INSERT INTO gasto_productos (gasto_id, orden, nombre, importe)
    SELECT g.id, x.orden, x.nombre, x.importe
    FROM g, jsonb_to_recordset(${productos}::jsonb) AS x(orden smallint, nombre text, importe numeric)
  `;
}

/** Gastos entre dos fechas (incluidas), para detectar duplicados al importar. */
export async function listExpensesBetween(from: string, to: string): Promise<Expense[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, seccion, concepto,
           importe::float8 AS importe, pagado_por, porcentaje_1::float8 AS porcentaje_1, saldado
    FROM gastos
    WHERE fecha >= ${from}::date AND fecha <= ${to}::date
  `) as Row[];
  return rows.map(toExpense);
}

/** Inserta varios gastos en una sola sentencia (todo o nada). */
export async function insertExpenses(list: Omit<Expense, "id">[]): Promise<void> {
  if (list.length === 0) return;
  const sql = await db();
  const payload = JSON.stringify(
    list.map((e) => ({
      fecha: e.fecha,
      seccion: e.seccion,
      concepto: e.concepto,
      importe: e.importe,
      pagado_por: e.pagadoPor,
      porcentaje_1: e.porcentaje1,
      saldado: e.saldado,
    })),
  );
  await sql`
    INSERT INTO gastos (fecha, seccion, concepto, importe, pagado_por, porcentaje_1, saldado, saldado_en)
    SELECT fecha, seccion, concepto, importe, pagado_por, porcentaje_1, saldado, CASE WHEN saldado THEN now() END
    FROM jsonb_to_recordset(${payload}::jsonb)
      AS x(fecha date, seccion text, concepto text, importe numeric, pagado_por smallint, porcentaje_1 numeric,
           saldado boolean)
  `;
}

/** Marca un gasto como pagado (o lo vuelve a dejar pendiente). Nunca lo borra. */
export async function setSettled(id: number, saldado: boolean): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE gastos SET saldado = ${saldado}, saldado_en = CASE WHEN ${saldado} THEN now() END
    WHERE id = ${id}
  `;
}

/** Marca como pagados todos los gastos pendientes de un mes. */
export async function settleMonth(month: MonthKey): Promise<void> {
  const sql = await db();
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  await sql`
    UPDATE gastos SET saldado = true, saldado_en = now()
    WHERE NOT saldado AND fecha >= ${from}::date AND fecha < ${to}::date
  `;
}

export async function removeExpense(id: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM gastos WHERE id = ${id}`;
}

// ---------- Wrapped anual ----------

/** Gastos entre dos fechas (incluidas) con sus productos, para calcular el Wrapped. */
export async function listExpensesDetailed(from: string, to: string): Promise<Expense[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, seccion, concepto,
           importe::float8 AS importe, pagado_por, porcentaje_1::float8 AS porcentaje_1, saldado,
           (SELECT json_agg(json_build_object('nombre', p.nombre, 'importe', p.importe::float8) ORDER BY p.orden)
              FROM gasto_productos p WHERE p.gasto_id = g.id) AS productos
    FROM gastos g
    WHERE fecha >= ${from}::date AND fecha <= ${to}::date
    ORDER BY fecha, id
  `) as Row[];
  return rows.map(toExpense);
}

export async function getWrappedSnapshot(year: number): Promise<WrappedData | null> {
  const sql = await db();
  const rows = (await sql`SELECT datos FROM wrapped_anual WHERE anio = ${year}`) as { datos: WrappedData }[];
  return rows[0]?.datos ?? null;
}

/** Años que tienen un Wrapped guardado, del más reciente al más antiguo. */
export async function listWrappedYears(): Promise<number[]> {
  const sql = await db();
  const rows = (await sql`SELECT anio FROM wrapped_anual ORDER BY anio DESC`) as { anio: number }[];
  return rows.map((r) => Number(r.anio));
}

/** Guarda el Wrapped de un año. Sin `overwrite`, si ya existe se respeta el guardado. */
export async function saveWrappedSnapshot(year: number, data: WrappedData, overwrite = false): Promise<void> {
  const sql = await db();
  const json = JSON.stringify(data);
  if (overwrite) {
    await sql`
      INSERT INTO wrapped_anual (anio, datos) VALUES (${year}, ${json}::jsonb)
      ON CONFLICT (anio) DO UPDATE SET datos = EXCLUDED.datos, generado_en = now()
    `;
  } else {
    await sql`INSERT INTO wrapped_anual (anio, datos) VALUES (${year}, ${json}::jsonb) ON CONFLICT (anio) DO NOTHING`;
  }
}

/** Resumen del año anterior (guardado o calculado) para comparar. */
async function previousYearSummary(year: number): Promise<WrappedData["prev"]> {
  const saved = await getWrappedSnapshot(year - 1);
  if (saved) return { year: year - 1, total: saved.total, coverageMonths: saved.coverageMonths };
  const rows = await listExpensesDetailed(`${year - 1}-01-01`, wrappedEnd(year - 1));
  return rows.length ? { year: year - 1, ...periodSummary(rows) } : null;
}

/**
 * Calcula el Wrapped de un año a partir de los gastos. Definitivo: del 1 de enero al 30 de
 * noviembre. Vista previa: hasta hoy (no se guarda). Devuelve null si no hay gastos.
 */
export async function computeWrapped(year: number, opts: { preview: boolean; today: string }): Promise<WrappedData | null> {
  const to = opts.preview ? opts.today : wrappedEnd(year);
  const [rows, couple, prev] = await Promise.all([
    listExpensesDetailed(`${year}-01-01`, to),
    getCouple(),
    // En la vista previa (periodo más corto) no se compara con el año anterior: no sería justo.
    opts.preview ? Promise.resolve(null) : previousYearSummary(year),
  ]);
  return buildWrapped(rows, { year, names: couple.names, to, preview: opts.preview, prev });
}

/**
 * Devuelve el Wrapped guardado de un año; si no existe y ya se ha desbloqueado
 * (1 de diciembre), lo genera y lo guarda. Así queda fijo y se puede volver a ver.
 */
export async function ensureWrapped(year: number, today: string): Promise<WrappedData | null> {
  const saved = await getWrappedSnapshot(year);
  if (saved) return saved;
  if (!isWrappedUnlocked(year, today)) return null;
  const data = await computeWrapped(year, { preview: false, today });
  if (data) await saveWrappedSnapshot(year, data);
  return data;
}

/**
 * Elimina todos los gastos anteriores a la fecha de corte. Es idempotente.
 * Antes de borrar un año se guarda su Wrapped, para que no se pierda con los gastos.
 */
export async function purgeExpired(retention: Retention): Promise<number> {
  const sql = await db();
  const dueYears = (await sql`
    SELECT DISTINCT EXTRACT(YEAR FROM fecha)::int AS y FROM gastos WHERE fecha < ${retention.cutoffDate}::date
  `) as { y: number }[];
  for (const { y } of dueYears) await ensureWrapped(Number(y), retention.today);

  const rows = (await sql`
    DELETE FROM gastos WHERE fecha < ${retention.cutoffDate}::date RETURNING id
  `) as { id: string }[];
  return rows.length;
}
