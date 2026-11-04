import "server-only";
import ExcelJS from "exceljs";
import { beneficiaryOf, owedAmount, parseAmount, type Beneficiary, type Expense } from "./calc";
import { FIXED_TYPES, RENT, SECTIONS, SECTION_TITLES, type PersonId, type Section } from "./config";
import type { ExpenseInput } from "./rules";

type Names = Record<PersonId, string>;

export const MAX_IMPORT_ROWS = 500;
const SHEET = "Gastos";
const COUPLE = "Pareja";
const BY_SALARY = "Según sueldos";
const PENDING = "Pendiente";
const PAID = "Pagado";
const NO_DEBT = "Sin deuda";

// Paleta de la app para el Excel.
const VIOLET = "FF7C3AED";
const VIOLET_LIGHT = "FFF5F3FF";

// ---------- Exportar ----------

/** Genera un .xlsx con los gastos. Se puede editar y volver a importar tal cual. */
export async function buildWorkbook(expenses: Expense[], names: Names): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cuentas en pareja";

  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Apartado", key: "apartado", width: 20 },
    { header: "Concepto", key: "concepto", width: 34 },
    { header: "Importe", key: "importe", width: 12, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Pagado por", key: "pagadoPor", width: 16 },
    { header: "Para", key: "para", width: 16 },
    { header: `Parte ${names[1]}`, key: "parte1", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: `Parte ${names[2]}`, key: "parte2", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Estado", key: "estado", width: 12 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLET } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  const sorted = expenses.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  for (const e of sorted) {
    const share1 = Math.round(e.importe * e.porcentaje1) / 100;
    const who = beneficiaryOf(e);
    const [y, m, d] = e.fecha.split("-").map(Number);
    ws.addRow({
      fecha: new Date(Date.UTC(y, m - 1, d)),
      apartado: SECTION_TITLES[e.seccion],
      concepto: e.concepto,
      importe: e.importe,
      pagadoPor: names[e.pagadoPor],
      para: e.seccion === "fijos" && e.concepto === RENT ? BY_SALARY : who === "pareja" ? COUPLE : names[who],
      parte1: share1,
      parte2: Math.round((e.importe - share1) * 100) / 100,
      estado: owedAmount(e) <= 0 ? NO_DEBT : e.saldado ? PAID : PENDING,
    });
  }

  // Desplegables para que sea fácil añadir filas a mano antes de importar.
  const lastRow = Math.max(ws.rowCount, 1) + 200;
  const list = (values: string[]) => `"${values.map((v) => v.replace(/[",]/g, " ")).join(",")}"`;
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list(SECTIONS.map((s) => s.title))] };
    ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list([names[1], names[2]])] };
    ws.getCell(`F${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [list([COUPLE, names[1], names[2], BY_SALARY])],
    };
    ws.getCell(`I${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [list([PENDING, PAID])] };
  }

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [{ width: 22 }, { width: 80 }];
  const rows: [string, string][] = [
    ["Cómo importar", "Rellena la hoja «Gastos» (una fila por gasto) y usa «Importar Excel» en la app."],
    ["Fecha", "Día del gasto (dd/mm/aaaa). Debe estar dentro de los meses que conserva la app."],
    ["Apartado", SECTIONS.map((s) => s.title).join(" · ")],
    ["Concepto", `En gastos fijos: ${FIXED_TYPES.join(", ")}. En el resto, texto libre.`],
    ["Importe", "Cantidad en euros, por ejemplo 45,90."],
    ["Pagado por", `${names[1]} o ${names[2]}.`],
    ["Para", `Solo para ocio: «${COUPLE}» (a medias), «${names[1]}» o «${names[2]}» (individual). Vacío = ${COUPLE}.`],
    ["Estado", `«${PENDING}» (la otra persona aún no ha devuelto su parte) o «${PAID}». Vacío = ${PENDING}.`],
    ["Columnas «Parte»", "Son informativas: la app recalcula el reparto al importar."],
    ["Duplicados", "Los gastos que ya existen en la app se ignoran, así que puedes reimportar sin miedo."],
  ];
  rows.forEach(([k, v]) => {
    const row = help.addRow([k, v]);
    row.getCell(1).font = { bold: true, color: { argb: VIOLET } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLET_LIGHT } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Importar ----------

export type ParsedRow = { row: number; input: ExpenseInput } | { row: number; error: string };

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Field = "fecha" | "apartado" | "concepto" | "importe" | "pagadoPor" | "para" | "estado";

const HEADER_ALIASES: Record<Field, string[]> = {
  fecha: ["fecha", "dia", "date"],
  apartado: ["apartado", "seccion", "categoria", "tipo de gasto"],
  concepto: ["concepto", "descripcion", "detalle", "tipo"],
  importe: ["importe", "cantidad", "precio", "total", "euros", "importe (€)", "importe (eur)"],
  pagadoPor: ["pagado por", "pagador", "quien paga", "quien pago", "pago"],
  para: ["para", "reparto", "de quien", "beneficiario"],
  estado: ["estado", "pagado", "saldado", "situacion"],
};

/** Convierte cualquier celda de ExcelJS (fórmula, enlace, texto enriquecido…) en un valor simple. */
function plain(value: ExcelJS.CellValue): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("result" in value) return plain(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return plain(value.text as ExcelJS.CellValue);
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(v: string | number | Date | null): string | null {
  if (v === null) return null;
  if (v instanceof Date) {
    // ExcelJS devuelve las fechas en UTC.
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number") {
    // Número de serie de Excel (días desde 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  return null;
}

function toSection(v: string, concepto: string): Section | null {
  const s = norm(v);
  if (!s) return FIXED_TYPES.some((t) => norm(t) === norm(concepto)) ? "fijos" : null;
  if (s.includes("fij")) return "fijos";
  if (s.includes("comida") || s.includes("compra") || s.includes("super")) return "comida";
  if (s.includes("ocio")) return "ocio";
  return null;
}

function toPerson(v: string, names: Names): PersonId | null {
  const s = norm(v);
  if (s === norm(names[1]) || s === "1") return 1;
  if (s === norm(names[2]) || s === "2") return 2;
  return null;
}

function toBeneficiary(v: string, names: Names): Beneficiary | null {
  const s = norm(v);
  if (["", "pareja", "ambos", "los dos", "compartido", "a medias", "50/50", norm(BY_SALARY)].includes(s)) {
    return "pareja";
  }
  return toPerson(v, names);
}

/** Lee la primera hoja con cabecera «Fecha» y devuelve cada fila ya interpretada o con su error. */
export async function parseWorkbook(data: ArrayBuffer, names: Names): Promise<ParsedRow[] | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { error: "No se ha podido leer el archivo. Asegúrate de que es un Excel (.xlsx)." };
  }

  // Busca la hoja y la fila de cabecera (en las 10 primeras filas).
  const sheets = [wb.getWorksheet(SHEET), ...wb.worksheets].filter((w): w is ExcelJS.Worksheet => !!w);
  for (const ws of sheets) {
    for (let h = 1; h <= Math.min(10, ws.rowCount); h++) {
      const cols = new Map<Field, number>();
      ws.getRow(h).eachCell((cell, col) => {
        const text = norm(String(plain(cell.value) ?? ""));
        for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
          if (!cols.has(field) && aliases.includes(text)) cols.set(field, col);
        }
      });
      if (!cols.has("fecha") || !cols.has("importe")) continue;

      const missing = (["concepto", "pagadoPor"] as Field[]).filter((f) => !cols.has(f));
      if (missing.length) {
        return { error: `Falta la columna ${missing.map((f) => (f === "pagadoPor" ? "«Pagado por»" : "«Concepto»")).join(" y ")}.` };
      }

      const out: ParsedRow[] = [];
      for (let r = h + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const get = (f: Field) => (cols.has(f) ? plain(row.getCell(cols.get(f)!).value) : null);
        const text = (f: Field) => String(get(f) ?? "").trim();

        const raw = (["fecha", "apartado", "concepto", "importe", "pagadoPor", "para", "estado"] as Field[]).map(text);
        if (raw.every((x) => x === "")) continue; // Fila vacía.
        if (out.length >= MAX_IMPORT_ROWS) {
          return { error: `El archivo tiene más de ${MAX_IMPORT_ROWS} gastos. Divídelo en varios archivos.` };
        }

        const fecha = toIsoDate(get("fecha"));
        if (!fecha) {
          out.push({ row: r, error: "fecha no válida" });
          continue;
        }

        let concepto = text("concepto");
        const seccion = toSection(text("apartado"), concepto);
        if (!seccion) {
          out.push({ row: r, error: `apartado no reconocido («${text("apartado")}»)` });
          continue;
        }
        if (seccion === "fijos") {
          concepto = FIXED_TYPES.find((t) => norm(t) === norm(concepto)) ?? concepto;
        }

        const rawAmount = get("importe");
        const importe =
          typeof rawAmount === "number" ? Math.round(rawAmount * 100) / 100 : parseAmount(String(rawAmount ?? "").trim());
        if (importe === null || importe <= 0) {
          out.push({ row: r, error: "importe no válido" });
          continue;
        }

        const pagadoPor = toPerson(text("pagadoPor"), names);
        if (!pagadoPor) {
          out.push({ row: r, error: `«Pagado por» debe ser ${names[1]} o ${names[2]}` });
          continue;
        }

        const para = toBeneficiary(text("para"), names);
        if (para === null) {
          out.push({ row: r, error: `«Para» debe ser ${COUPLE}, ${names[1]} o ${names[2]}` });
          continue;
        }

        const estado = norm(text("estado"));
        let saldado: boolean;
        if (["", norm(PENDING), "no", "debe", norm(NO_DEBT)].includes(estado)) saldado = false;
        else if ([norm(PAID), "saldado", "si", "devuelto", "liquidado"].includes(estado)) saldado = true;
        else {
          out.push({ row: r, error: `«Estado» debe ser ${PENDING} o ${PAID}` });
          continue;
        }

        out.push({ row: r, input: { fecha, seccion, concepto, importe, pagadoPor, para, saldado } });
      }
      return out;
    }
  }
  return { error: "No se encuentra la cabecera. La primera fila debe tener al menos «Fecha», «Concepto», «Importe» y «Pagado por»." };
}
