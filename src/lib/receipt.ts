/**
 * Interpreta el texto que el OCR saca de un ticket: total, fecha, comercio y
 * un apartado sugerido. El OCR se equivoca a menudo, así que todo es una
 * propuesta que la persona revisa antes de guardar.
 *
 * Sin dependencias: se usa en el navegador y se puede probar con Node.
 */

export type ReceiptGuess = {
  /** Total más probable, o null si no se encuentra ningún importe. */
  total: number | null;
  /** Otros importes del ticket para elegir con un toque (incluye el total). */
  candidates: number[];
  /** Fecha del ticket en formato "YYYY-MM-DD", si se lee. */
  date: string | null;
  /** Nombre del comercio (primera línea con letras), si se lee. */
  merchant: string | null;
  /** Apartado sugerido según el comercio y las palabras del ticket. */
  section: "comida" | "ocio" | null;
};

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Importes con 2 decimales: "23,45", "23.45", "1.234,56", "23, 45" (espacio del OCR).
const AMOUNT = /(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?[,.]\s?(\d{2})(?!\d)/g;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const n = Number(`${m[1].replace(/[.\s]/g, "")}.${m[2]}`);
    if (n > 0 && n < 100_000) out.push(n);
  }
  return out;
}

// El OCR confunde letras: «T0TAL», «TOTA1», «TOTAI».
const TOTAL = /t[o0]ta[l1i]/;
const TO_PAY = /a\s*pagar|importe\s*total|total\s*a\s*pagar|total\s*compra|total\s*venta/;
const PAYMENT = /tarjeta|visa|mastercard|maestro|contactless|bizum|pago\s*con|cobrado|importe/;
// Líneas con importes que NO son el total.
const NOT_TOTAL =
  /sub\s*-?\s*t[o0]ta|base|cuota|t[o0]ta[l1i]\s*(de\s*)?iva|iva\s*\d|\d+\s*%|cambio|entregad|devol|efectivo|ahorro|descuento|dto|puntos|propina|articulos|unidades|uds/;

/** Busca el total. Prioridad: «a pagar» > «total» > línea de pago > el importe mayor. */
function findTotal(lines: string[]): { total: number | null; candidates: number[] } {
  const scored: { value: number; score: number }[] = [];
  const all: number[] = [];

  lines.forEach((raw, i) => {
    const line = strip(raw);
    const here = amountsIn(raw);
    all.push(...here);
    if (NOT_TOTAL.test(line)) return;

    let score = 0;
    if (TO_PAY.test(line)) score = 3;
    else if (TOTAL.test(line)) score = 2;
    else if (PAYMENT.test(line)) score = 1;
    if (!score) return;

    // El importe suele ir al final de la línea; si no hay, en la siguiente.
    let values = here;
    if (!values.length && i + 1 < lines.length && !NOT_TOTAL.test(strip(lines[i + 1]))) {
      values = amountsIn(lines[i + 1]);
    }
    if (values.length) scored.push({ value: values[values.length - 1], score });
  });

  let total: number | null = null;
  if (scored.length) {
    const best = Math.max(...scored.map((s) => s.score));
    // Entre las líneas de mayor prioridad, el total es el mayor (el subtotal nunca lo supera).
    total = Math.max(...scored.filter((s) => s.score === best).map((s) => s.value));
    // Si la línea de pago coincide con algún «total», confirma ese valor.
    const confirmed = scored.filter((s) => s.score >= 2).map((s) => s.value);
    const paid = scored.filter((s) => s.score === 1).map((s) => s.value);
    const both = confirmed.find((v) => paid.includes(v));
    if (both !== undefined) total = both;
  } else if (all.length) {
    total = Math.max(...all);
  }

  // Candidatos: el total primero y luego los importes más repetidos y mayores.
  const freq = new Map<number, number>();
  for (const v of all) freq.set(v, (freq.get(v) ?? 0) + 1);
  const candidates = [...freq.keys()]
    .sort((a, b) => (freq.get(b)! - freq.get(a)!) || b - a)
    .filter((v) => v !== total)
    .slice(0, 5);
  if (total !== null) candidates.unshift(total);
  return { total, candidates: candidates.slice(0, 6) };
}

function findDate(text: string): string | null {
  for (const m of text.matchAll(/(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4}|\d{2})(?!\d)/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) continue;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCDate() !== day) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // También "2026-11-04".
  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/mercadona/, "Mercadona"],
  [/\blidl\b/, "Lidl"],
  [/carrefour/, "Carrefour"],
  [/\baldi\b/, "Aldi"],
  [/alcampo/, "Alcampo"],
  [/eroski/, "Eroski"],
  [/consum/, "Consum"],
  [/ahorramas/, "Ahorramás"],
  [/hipercor/, "Hipercor"],
  [/caprabo/, "Caprabo"],
  [/bonpreu/, "Bonpreu"],
  [/gadis/, "Gadis"],
  [/\bdia\b/, "Dia"],
  [/el corte ingles/, "El Corte Inglés"],
];

// Palabras de la cabecera que indican tienda de alimentación.
const FOOD = /super|mercado|fruteria|carniceria|pescaderia|panaderia|alimentacion|hiper|ultramarinos/;
// Palabras (en todo el ticket) que indican ocio. Se evitan las ambiguas como «café», que también se compra en el súper.
const LEISURE = /restaurante|\bbar\b|cafeteria|cerveceria|taberna|pizzeria|burger|sushi|kebab|menu|mesa|comensal|camarero|propina|cines?\b|teatro|entradas?\b|concierto|museo|bolera|discoteca|copas|cocktail/;

/** Las primeras líneas, donde suelen ir el nombre y los datos del comercio. */
const headerOf = (lines: string[], n = 5) => strip(lines.slice(0, n).join("\n"));
/** El nombre del comercio va en la primera o segunda línea (más abajo, «menú del día» no es el súper Dia). */
const brandOf = (lines: string[]) => KNOWN_MERCHANTS.find(([re]) => re.test(headerOf(lines, 2)))?.[1] ?? null;

function findMerchant(lines: string[]): string | null {
  const brand = brandOf(lines);
  if (brand) return brand;
  for (const raw of lines.slice(0, 6)) {
    const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, "").trim();
    if (letters.length < 3 || letters.length < raw.trim().length * 0.6) continue;
    if (/^(ticket|factura|simplificada|nif|cif|tel|c\/|calle|avda)/i.test(letters)) continue;
    // "SUPERMERCADOS PEPE S.L." → "Supermercados Pepe"
    return letters
      .replace(/\b(s ?l|s ?a|s ?l ?u)\b\.?$/i, "")
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
      .slice(0, 60);
  }
  return null;
}

export function parseReceipt(text: string): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = headerOf(lines);
  const { total, candidates } = findTotal(lines);
  const brand = brandOf(lines) !== null;
  const section = brand ? "comida" : LEISURE.test(strip(text)) ? "ocio" : FOOD.test(header) ? "comida" : null;
  return { total, candidates, date: findDate(text), merchant: findMerchant(lines), section };
}
