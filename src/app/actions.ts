"use server";

import { refresh } from "next/cache";
import { parseAmount, type Expense } from "@/lib/calc";
import { RENT, canBeIndividual, isSection, type PersonId } from "@/lib/config";
import { parseWorkbook } from "@/lib/excel";
import {
  computeWrapped,
  getCouple,
  getExpense,
  insertExpense,
  insertExpenses,
  listExpensesBetween,
  purgeExpired,
  removeExpense,
  saveCouple,
  saveWrappedSnapshot,
  setSettled,
  settleMonth,
  updateExpense,
} from "@/lib/expenses";
import { getRetention, isValidMonthKey } from "@/lib/periods";
import { isWrappedUnlocked } from "@/lib/wrapped";
import { buildExpense, parseProducts } from "@/lib/rules";

// ---------- Pareja ----------

export type CoupleFormState = { ok?: boolean; error?: string; submission?: number };

export async function updateCouple(_prev: CoupleFormState, formData: FormData): Promise<CoupleFormState> {
  const name1 = String(formData.get("nombre1") ?? "").trim();
  const name2 = String(formData.get("nombre2") ?? "").trim();
  const salary1 = parseAmount(String(formData.get("sueldo1") ?? "").trim());
  const salary2 = parseAmount(String(formData.get("sueldo2") ?? "").trim());

  if (!name1 || !name2) return { error: "Indica el nombre de las dos personas." };
  if (name1.length > 40 || name2.length > 40) return { error: "Los nombres no pueden superar 40 caracteres." };
  if (salary1 === null || salary2 === null) return { error: "Introduce los dos sueldos mensuales (por ejemplo, 1.850)." };
  if (salary1 + salary2 <= 0) return { error: "Al menos uno de los sueldos debe ser mayor que cero." };

  await saveCouple({ names: { 1: name1, 2: name2 }, salaries: { 1: salary1, 2: salary2 } });
  refresh();
  return { ok: true, submission: Date.now() };
}

// ---------- Gastos ----------

export type ExpenseFormValues = {
  fecha: string;
  concepto: string;
  importe: string;
  pagadoPor: string;
  para: string;
};

export type ExpenseFormState = {
  ok?: boolean;
  error?: string;
  values?: ExpenseFormValues;
  submission?: number;
};

export async function createExpense(_prev: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const seccion = formData.get("seccion");
  const values: ExpenseFormValues = {
    fecha: String(formData.get("fecha") ?? ""),
    concepto: String(formData.get("concepto") ?? "").trim(),
    importe: String(formData.get("importe") ?? "").trim(),
    pagadoPor: String(formData.get("pagadoPor") ?? ""),
    para: String(formData.get("para") ?? "pareja"),
  };
  const fail = (error: string): ExpenseFormState => ({ error, values, submission: Date.now() });

  if (!isSection(seccion)) return fail("Apartado no válido.");
  const importe = parseAmount(values.importe);
  if (importe === null || importe <= 0) return fail("Introduce un importe válido (por ejemplo, 45,90).");
  if (values.pagadoPor !== "1" && values.pagadoPor !== "2") return fail("Indica quién ha pagado.");
  if (!["pareja", "1", "2"].includes(values.para)) return fail("Indica para quién es el gasto.");

  const retention = getRetention();
  const couple = await getCouple();
  const result = buildExpense(
    {
      fecha: values.fecha,
      seccion,
      concepto: values.concepto,
      importe,
      pagadoPor: Number(values.pagadoPor) as PersonId,
      para: values.para === "pareja" ? "pareja" : (Number(values.para) as PersonId),
    },
    { retention, salaries: couple.salaries },
  );
  if ("error" in result) return fail(result.error);

  // Productos del ticket escaneado (opcional).
  const products = parseProducts(formData.get("productos"));
  if ("error" in products) return fail(products.error);

  await purgeExpired(retention);
  await insertExpense(products.productos.length ? { ...result.expense, productos: products.productos } : result.expense);

  refresh();
  return {
    ok: true,
    submission: Date.now(),
    values: { ...values, concepto: seccion === "fijos" ? values.concepto : "", importe: "", para: "pareja" },
  };
}

// ---------- Importar desde Excel ----------

export type ImportState = {
  ok?: boolean;
  error?: string;
  imported?: number;
  duplicates?: number;
  /** Gastos que ya existían como pendientes y el archivo marca como pagados. */
  settled?: number;
  rowErrors?: string[];
  submission?: number;
};

const MAX_FILE_BYTES = 900 * 1024;

/** Clave para detectar gastos repetidos (mismo día, apartado, concepto, importe, pagador y reparto). */
const expenseKey = (e: Omit<Expense, "id">) =>
  [e.fecha, e.seccion, e.concepto.toLowerCase(), e.importe.toFixed(2), e.pagadoPor, e.porcentaje1.toFixed(2)].join("|");

export async function importExpenses(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const done = (s: ImportState): ImportState => ({ ...s, submission: Date.now() });
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return done({ error: "Selecciona un archivo Excel." });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return done({ error: "El archivo debe ser un Excel (.xlsx)." });
  if (file.size > MAX_FILE_BYTES) return done({ error: "El archivo es demasiado grande (máximo 900 KB)." });

  const couple = await getCouple();
  if (!couple.configured) return done({ error: "Configurad primero vuestros nombres y sueldos." });

  const parsed = await parseWorkbook(await file.arrayBuffer(), couple.names);
  if ("error" in parsed) return done({ error: parsed.error });
  if (parsed.length === 0) return done({ error: "El archivo no tiene gastos." });

  const retention = getRetention();
  await purgeExpired(retention);

  // Agrupa los gastos que ya existen para no duplicarlos al reimportar.
  const existing = new Map<string, Expense[]>();
  for (const e of await listExpensesBetween(retention.cutoffDate, retention.maxDate)) {
    const k = expenseKey(e);
    existing.set(k, [...(existing.get(k) ?? []), e]);
  }
  const toSettle: number[] = [];

  const toInsert: Omit<Expense, "id">[] = [];
  const rowErrors: string[] = [];
  let duplicates = 0;
  for (const p of parsed) {
    if ("error" in p) {
      rowErrors.push(`Fila ${p.row}: ${p.error}.`);
      continue;
    }
    const result = buildExpense(p.input, { retention, salaries: couple.salaries });
    if ("error" in result) {
      rowErrors.push(`Fila ${p.row}: ${result.error}`);
      continue;
    }
    const same = existing.get(expenseKey(result.expense));
    if (same?.length) {
      // Ya existe: no se duplica. Si el archivo dice «Pagado» y estaba pendiente, se marca como pagado.
      const match = (result.expense.saldado && same.find((e) => !e.saldado)) || same[0];
      same.splice(same.indexOf(match), 1);
      if (result.expense.saldado && !match.saldado) toSettle.push(match.id);
      else duplicates++;
      continue;
    }
    toInsert.push(result.expense);
  }

  await insertExpenses(toInsert);
  for (const id of toSettle) await setSettled(id, true);
  if (toInsert.length > 0 || toSettle.length > 0) refresh();

  return done({
    ok: toInsert.length > 0 || duplicates > 0 || toSettle.length > 0,
    imported: toInsert.length,
    duplicates,
    settled: toSettle.length,
    rowErrors,
  });
}

// ---------- Editar un gasto guardado ----------

export type EditExpenseState = { ok?: boolean; error?: string; submission?: number };

/**
 * Guarda los cambios de un gasto. Usa las mismas reglas que al crearlo y
 * conserva lo que no se edita: si estaba pagado, y el % del alquiler con el
 * que se registró (cambiar los sueldos no altera los alquileres pasados).
 */
export async function editExpense(_prev: EditExpenseState, formData: FormData): Promise<EditExpenseState> {
  const done = (s: EditExpenseState): EditExpenseState => ({ ...s, submission: Date.now() });
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return done({ error: "Gasto no válido." });
  const existing = await getExpense(id);
  if (!existing) return done({ error: "Este gasto ya no existe (puede que se haya borrado)." });

  const seccion = formData.get("seccion");
  if (!isSection(seccion)) return done({ error: "Elige un apartado." });
  const importe = parseAmount(String(formData.get("importe") ?? "").trim());
  if (importe === null || importe <= 0) return done({ error: "Introduce un importe válido (por ejemplo, 45,90)." });
  const pagadoPor = String(formData.get("pagadoPor") ?? "");
  if (pagadoPor !== "1" && pagadoPor !== "2") return done({ error: "Indica quién ha pagado." });
  const para = String(formData.get("para") ?? "pareja");
  if (!["pareja", "1", "2"].includes(para)) return done({ error: "Indica para quién es el gasto." });

  const couple = await getCouple();
  const result = buildExpense(
    {
      fecha: String(formData.get("fecha") ?? ""),
      seccion,
      concepto: String(formData.get("concepto") ?? ""),
      importe,
      pagadoPor: Number(pagadoPor) as PersonId,
      para:
        para !== "pareja" && canBeIndividual(seccion, String(formData.get("concepto") ?? "").trim())
          ? (Number(para) as PersonId)
          : "pareja",
      saldado: existing.saldado,
    },
    { retention: getRetention(), salaries: couple.salaries },
  );
  if ("error" in result) return done({ error: result.error });

  const expense = { ...result.expense };
  const wasRent = existing.seccion === "fijos" && existing.concepto === RENT;
  if (wasRent && expense.seccion === "fijos" && expense.concepto === RENT) expense.porcentaje1 = existing.porcentaje1;

  const products = parseProducts(formData.get("productos"));
  if ("error" in products) return done({ error: products.error });

  const updated = await updateExpense({ ...expense, id, productos: products.productos });
  if (!updated) return done({ error: "Este gasto ya no existe (puede que se haya borrado)." });
  refresh();
  return done({ ok: true });
}

// ---------- Wrapped ----------

/**
 * Vuelve a calcular el Wrapped de un año con los gastos actuales (por ejemplo, tras importar
 * gastos que faltaban). Solo si el año ya está desbloqueado y sus gastos siguen guardados.
 */
export async function regenerateWrapped(formData: FormData): Promise<void> {
  const year = Number(formData.get("anio"));
  const retention = getRetention();
  if (!Number.isInteger(year) || !retention.years.includes(year) || !isWrappedUnlocked(year, retention.today)) return;
  const data = await computeWrapped(year, { preview: false, today: retention.today });
  if (data) await saveWrappedSnapshot(year, data, true);
  refresh();
}

// ---------- Pagado / pendiente ----------

/** Marca un gasto como pagado o pendiente. El gasto nunca se borra. */
export async function toggleSettled(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const saldado = formData.get("saldado") === "true";
  if (!Number.isInteger(id) || id <= 0) return;
  await setSettled(id, saldado);
  refresh();
}

/** Marca como pagados todos los gastos pendientes del mes. */
export async function settleAll(formData: FormData): Promise<void> {
  const month = formData.get("mes");
  if (!isValidMonthKey(month) || !getRetention().months.includes(month)) return;
  await settleMonth(month);
  refresh();
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await removeExpense(id);
  refresh();
}
