import { owedAmount, rentPercent, type Beneficiary, type Expense, type Product } from "./calc";
import { FIXED_TYPES, RENT, type FixedType, type PersonId, type Section } from "./config";
import { formatDate, isValidDate, type Retention } from "./periods";

export type ExpenseInput = {
  fecha: string;
  seccion: Section;
  concepto: string;
  importe: number;
  pagadoPor: PersonId;
  para: Beneficiary;
  /** Si la otra persona ya ha devuelto su parte. Por defecto, pendiente. */
  saldado?: boolean;
};

export type BuildResult = { expense: Omit<Expense, "id"> } | { error: string };

/**
 * Valida un gasto y calcula su reparto. Lo usan tanto el formulario como la
 * importación desde Excel, para que las reglas sean siempre las mismas:
 *  - Alquiler: según sueldos.
 *  - Ocio individual: el 100 % para quien lo disfruta.
 *  - Todo lo demás: a partes iguales.
 */
export function buildExpense(
  input: ExpenseInput,
  ctx: { retention: Retention; salaries: Record<PersonId, number | null> },
): BuildResult {
  const { retention } = ctx;
  if (!isValidDate(input.fecha)) return { error: "Introduce una fecha válida." };
  if (input.fecha < retention.cutoffDate || input.fecha > retention.maxDate) {
    return {
      error: `La fecha debe estar entre el ${formatDate(retention.cutoffDate, "long")} y el ${formatDate(retention.maxDate, "long")}.`,
    };
  }

  const concepto = input.concepto.trim();
  if (input.seccion === "fijos") {
    if (!FIXED_TYPES.includes(concepto as FixedType)) {
      return { error: `El tipo de gasto fijo debe ser ${FIXED_TYPES.join(", ")}.` };
    }
  } else {
    if (!concepto) return { error: "Indica un concepto." };
    if (concepto.length > 120) return { error: "El concepto no puede superar 120 caracteres." };
  }

  if (!Number.isFinite(input.importe) || input.importe <= 0) {
    return { error: "Introduce un importe válido (por ejemplo, 45,90)." };
  }
  if (input.pagadoPor !== 1 && input.pagadoPor !== 2) return { error: "Indica quién ha pagado." };

  if (input.para !== "pareja" && input.seccion !== "ocio") {
    return { error: "Solo el ocio puede ser individual." };
  }

  let porcentaje1 = 50;
  if (input.seccion === "fijos" && concepto === RENT) {
    const pct = rentPercent(ctx.salaries);
    if (pct === null) return { error: "Para registrar el alquiler, indica antes los sueldos en «Datos de la pareja»." };
    porcentaje1 = pct;
  } else if (input.para === 1) {
    porcentaje1 = 100;
  } else if (input.para === 2) {
    porcentaje1 = 0;
  }

  const importe = Math.round(input.importe * 100) / 100;
  // Un gasto sin deuda (p. ej., ocio individual pagado por su dueño) nunca queda «pendiente».
  const hasDebt = owedAmount({ importe, porcentaje1, pagadoPor: input.pagadoPor }) > 0;
  return {
    expense: {
      fecha: input.fecha,
      seccion: input.seccion,
      concepto,
      importe,
      pagadoPor: input.pagadoPor,
      porcentaje1,
      saldado: hasDebt && (input.saldado ?? false),
    },
  };
}

export const MAX_PRODUCTS = 100;

/** Valida la lista de productos de un ticket que llega del formulario (JSON). */
export function parseProducts(raw: FormDataEntryValue | null): { productos: Product[] } | { error: string } {
  if (raw === null || raw === "") return { productos: [] };
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return { error: "La lista de productos no es válida." };
  }
  if (!Array.isArray(data)) return { error: "La lista de productos no es válida." };
  if (data.length > MAX_PRODUCTS) return { error: `Como máximo ${MAX_PRODUCTS} productos por ticket.` };

  const productos: Product[] = [];
  for (const [i, item] of data.entries()) {
    const n = i + 1;
    const nombre = typeof item?.nombre === "string" ? item.nombre.trim() : "";
    const importe = typeof item?.importe === "number" ? Math.round(item.importe * 100) / 100 : NaN;
    if (!nombre) return { error: `Producto ${n}: falta el nombre.` };
    if (nombre.length > 80) return { error: `Producto ${n}: el nombre no puede superar 80 caracteres.` };
    if (!Number.isFinite(importe) || importe <= 0 || importe >= 100_000) {
      return { error: `Producto ${n} («${nombre.slice(0, 30)}»): el precio no es válido.` };
    }
    productos.push({ nombre, importe });
  }
  return { productos };
}
