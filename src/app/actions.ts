"use server";

import { refresh } from "next/cache";
import { parseAmount, type Expense } from "@/lib/calc";
import { isSection, type PersonId } from "@/lib/config";
import { parseWorkbook } from "@/lib/excel";
import {
  getCouple,
  insertExpense,
  insertExpenses,
  listExpensesBetween,
  purgeExpired,
  removeExpense,
  saveCouple,
} from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { buildExpense } from "@/lib/rules";

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

  await purgeExpired(retention);
  await insertExpense(result.expense);

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

  // Cuenta los gastos que ya existen para no duplicarlos al reimportar.
  const existing = new Map<string, number>();
  for (const e of await listExpensesBetween(retention.cutoffDate, retention.maxDate)) {
    const k = expenseKey(e);
    existing.set(k, (existing.get(k) ?? 0) + 1);
  }

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
    const k = expenseKey(result.expense);
    const seen = existing.get(k) ?? 0;
    if (seen > 0) {
      existing.set(k, seen - 1);
      duplicates++;
      continue;
    }
    toInsert.push(result.expense);
  }

  await insertExpenses(toInsert);
  if (toInsert.length > 0) refresh();

  return done({
    ok: toInsert.length > 0 || duplicates > 0,
    imported: toInsert.length,
    duplicates,
    rowErrors,
  });
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await removeExpense(id);
  refresh();
}
