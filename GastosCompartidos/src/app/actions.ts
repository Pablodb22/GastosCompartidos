"use server";

import { refresh } from "next/cache";
import { parseAmount, rentPercent } from "@/lib/calc";
import { FIXED_TYPES, RENT, isSection, type PersonId } from "@/lib/config";
import { getCouple, insertExpense, purgeExpired, removeExpense, saveCouple } from "@/lib/expenses";
import { formatDate, getRetention, isValidDate } from "@/lib/periods";

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
  };
  const fail = (error: string): ExpenseFormState => ({ error, values, submission: Date.now() });

  if (!isSection(seccion)) return fail("Apartado no válido.");

  const retention = getRetention();
  if (!isValidDate(values.fecha)) return fail("Introduce una fecha válida.");
  if (values.fecha < retention.cutoffDate || values.fecha > retention.maxDate) {
    return fail(
      `La fecha debe estar entre el ${formatDate(retention.cutoffDate, "long")} y el ${formatDate(retention.maxDate, "long")}.`,
    );
  }

  if (seccion === "fijos") {
    if (!FIXED_TYPES.includes(values.concepto as (typeof FIXED_TYPES)[number])) {
      return fail("Selecciona el tipo de gasto fijo.");
    }
  } else {
    if (!values.concepto) return fail("Indica un concepto.");
    if (values.concepto.length > 120) return fail("El concepto no puede superar 120 caracteres.");
  }

  const importe = parseAmount(values.importe);
  if (importe === null || importe <= 0) return fail("Introduce un importe válido (por ejemplo, 45,90).");
  if (values.pagadoPor !== "1" && values.pagadoPor !== "2") return fail("Indica quién ha pagado.");

  // El alquiler se reparte según los sueldos; el resto, a partes iguales.
  let porcentaje1 = 50;
  if (seccion === "fijos" && values.concepto === RENT) {
    const couple = await getCouple();
    const pct = rentPercent(couple.salaries);
    if (pct === null) {
      return fail("Para registrar el alquiler, indica antes los sueldos en «Datos de la pareja».");
    }
    porcentaje1 = pct;
  }

  await purgeExpired(retention);
  await insertExpense({
    fecha: values.fecha,
    seccion,
    concepto: values.concepto,
    importe,
    pagadoPor: Number(values.pagadoPor) as PersonId,
    porcentaje1,
  });

  refresh();
  return {
    ok: true,
    submission: Date.now(),
    values: { ...values, concepto: seccion === "fijos" ? values.concepto : "", importe: "" },
  };
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await removeExpense(id);
  refresh();
}
