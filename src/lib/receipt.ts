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
  /** Productos leídos (nombre y precio de la línea). Pueden faltar o venir mal: se revisan a mano. */
  items: ReceiptItem[];
};

/** Producto leído. `price` ya lleva restado el descuento (`discount`), si lo hay. */
export type ReceiptItem = { name: string; price: number; discount?: number };

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

// ---------- Productos ----------

// Importe al final de la línea, con posibles restos: "€", código de IVA ("A", "B"…) o "*".
// La letra del IVA a veces se lee como un dígito pegado o suelto: "2,79 B" → "2,79 8" o "1,15B" → "1,158".
const TRAILING_AMOUNT = /(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?[,.]\s?(\d{2})(?:\s?\d)?\s*(?:€|eur|[a-d*])?\s*$/i;
// Líneas que nunca son un producto.
const NOT_ITEM =
  /\bnif\b|\bcif\b|\btel\b|telefono|factura|ticket|fecha|\bhora\b|\bop\b|cajer|atendid|\bmesa\b|comensal|c\/|calle|avda|www|http|descuento|\bdto\b|ahorro|promo|oferta aplicada|cupon|\biva\b|\bbase\b|cuota|redondeo/;
// Línea de descuento de un producto: "Descuento Lidl Plus -0,50", "DTO 2ª UNIDAD 50% -0,75", "-0,50", "0,50-".
const DISCOUNT =
  /descuento|\bdto\b|\bdto\.|promo|ahorro|oferta|rebaja|cupon|2\s*[ªºa]\s*(unidad|ud)|segunda unidad|lidl plus|\bclub\b|\bvale\b/;
const NEGATIVE_AMOUNT = /(^|\s)-\s?\d{1,5}\s?[,.]\s?\d{2}|\d[,.]\d{2}\s?-\s*$/;
// Fin de la lista de productos: el subtotal, el total o el pago.
const ITEMS_END = /sub\s*-?\s*t[o0]ta|t[o0]ta[l1i]|a\s*pagar|importe\s*total/;
// Restos de una línea de peso o precio unitario ("0,850 kg x 2,49 €/kg").
const UNIT_JUNK = /\d+[.,]\d{1,3}\s*(kg|g|l|ud|uds|u)\b|€?\s*\/\s*(kg|ud|l)\b|\bx\b|×|@/gi;

function cleanName(raw: string): string {
  const name = raw
    .replace(AMOUNT, " ")
    .replace(UNIT_JUNK, " ")
    .replace(/[|_=~*#<>{}\[\]]+/g, " ")
    .replace(/^[\s.,:;\-–—]+|[\s.,:;\-–—€]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80);
}

// "0,850 kg x 2,49 €/kg": peso y precio por kilo, para calcular el importe si el OCR lo lee mal.
const WEIGHT = /(\d+[.,]\d{1,3})\s*kg\s*[x×*]?\s*(\d+[.,]\d{2})\s*€?\s*\/\s*kg/i;
// El OCR a veces se come la coma: "CAJA GALLETAS 210" → 2,10 €.
const CENTS_NO_COMMA = /\s(\d{3,4})\s*$/;
// …pero no si el número es una cantidad con unidad ("250 g", "1000 ml").
const UNIT_AFTER_NUMBER = /\d\s*(g|gr|kg|ml|cl|l|uds?|u)\s*$/i;

const num = (s: string) => Number(s.replace(",", "."));

const hasWords = (s: string) => /[a-záéíóúüñ]{3,}/i.test(s.replace(UNIT_JUNK, " "));

// Cabecera de columnas ("UDS DESCRIPCION TOTAL", "Descripción P. Unit Importe"): no es el total.
const COLUMN_HEADER = /descrip|articulo|\bud?s\b|\bcant|p\.?\s*unit|precio|importe|concepto/;
// Línea de recuento ("TOTAL ARTICULOS: 10"): ya ha terminado la lista, pero no es el importe.
const ITEM_COUNT = /t[o0]ta[l1i]\s*(de\s*)?(articulos|unidades|uds|productos)|n\.?\s*[ºo°]?\s*(de\s*)?articulos/;

/**
 * Dónde acaba la lista de productos: en el subtotal o total con importe, en
 * «TOTAL ARTICULOS», o en un «TOTAL» cuyo importe va solo en la línea de abajo.
 * Una cabecera de columnas con la palabra «TOTAL» no corta la lista.
 */
function findItemsEnd(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = strip(lines[i]);
    if (!ITEMS_END.test(line)) continue;
    if (ITEM_COUNT.test(line)) return i;
    if (amountsIn(lines[i]).length) return i;
    if (COLUMN_HEADER.test(line)) continue;
    const next = lines[i + 1] ?? "";
    if (amountsIn(next).length && !hasWords(next)) return i;
  }
  return -1;
}

/**
 * Busca los productos: líneas antes del total que terminan en un importe.
 * Entiende cantidades ("2 PAN BARRA 0,60 1,20" → «2 × Pan barra», 1,20 €)
 * y productos a peso en dos líneas ("TOMATE" / "0,850 kg x 2,49 €/kg 2,12").
 */
function findItems(lines: string[]): ReceiptItem[] {
  let end = findItemsEnd(lines);
  if (end < 0) end = lines.findIndex((l) => PAYMENT.test(strip(l)));
  if (end < 0) end = lines.length;

  const items: ReceiptItem[] = [];
  let pendingName: string | null = null; // Línea con nombre y sin precio (producto a peso).

  for (const raw of lines.slice(0, end)) {
    const line = strip(raw);

    // Descuento: se resta del producto anterior, que queda con el precio final.
    // Es descuento si el importe va en negativo, si la línea empieza por «descuento», «dto», «promo»…
    // o si lleva un %. Así «GALLETAS OFERTA 2,50» sigue siendo un producto.
    const firstWords = line.trim().split(/\s+/)[0] ?? "";
    if (NEGATIVE_AMOUNT.test(raw) || DISCOUNT.test(firstWords) || (DISCOUNT.test(line) && line.includes("%"))) {
      const prev = items[items.length - 1];
      const amounts = amountsIn(raw);
      const pct = line.match(/(\d{1,2})\s*%/);
      let off = amounts.length ? amounts[amounts.length - 1] : pct && prev ? (prev.price * Number(pct[1])) / 100 : 0;
      off = Math.round(off * 100) / 100;
      // Solo si es menor que el precio (un descuento mayor no es de ese producto: p. ej., un cupón general).
      if (prev && off > 0 && off < prev.price) {
        prev.price = Math.round((prev.price - off) * 100) / 100;
        prev.discount = Math.round(((prev.discount ?? 0) + off) * 100) / 100;
      }
      pendingName = null;
      continue;
    }

    if (NOT_ITEM.test(line) || /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(line)) {
      pendingName = null;
      continue;
    }
    const w = raw.match(WEIGHT);
    const weighed = w ? Math.round(num(w[1]) * num(w[2]) * 100) / 100 : null;
    const m = raw.match(TRAILING_AMOUNT);
    let price: number;
    let body: string;
    if (m) {
      price = Number(`${m[1].replace(/[.\s]/g, "")}.${m[2]}`);
      body = raw.slice(0, m.index).trim();
      // Línea de peso: si el importe leído no cuadra con peso × precio/kg, manda el cálculo.
      if (weighed !== null && Math.abs(weighed - price) > 0.02) price = weighed;
    } else if (weighed !== null) {
      price = weighed;
      body = raw;
    } else {
      const c = raw.match(CENTS_NO_COMMA);
      if (c && hasWords(raw) && !UNIT_AFTER_NUMBER.test(raw.trim())) {
        price = Number(c[1]) / 100;
        body = raw.slice(0, c.index).trim();
      } else {
        // Posible nombre de un producto a peso; su precio viene en la línea siguiente.
        pendingName = hasWords(raw) && raw.trim().length <= 60 ? raw : null;
        continue;
      }
    }

    if (!hasWords(body)) {
      if (!pendingName) continue;
      body = pendingName; // "0,850 kg x 2,49 €/kg 2,12" → precio del producto de la línea anterior.
    }
    pendingName = null;

    // Cantidad al principio: "2 PAN BARRA" o "2x PAN".
    let qty = 1;
    const q = body.match(/^(\d{1,2})\s*[x×]?\s+(?=\D)/i);
    if (q) {
      qty = Number(q[1]);
      body = body.slice(q[0].length);
    }
    const name = cleanName(body);
    if (!name || price <= 0 || price >= 10_000) continue;
    items.push({ name: qty > 1 ? `${qty} × ${name}` : name, price });
  }
  return items;
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
  return { total, candidates, date: findDate(text), merchant: findMerchant(lines), section, items: findItems(lines) };
}

/** Puntuación que alcanza una lectura cuyos productos suman exactamente el total. */
export const PERFECT = 1000;

/**
 * Lo bien que ha salido una lectura, para elegir entre varias pasadas del OCR:
 * lo mejor es que los productos sumen el total; si no, cuanto más cerca y más
 * productos, mejor.
 */
export function receiptScore(g: ReceiptGuess): number {
  if (g.total === null) return g.items.length;
  const sum = g.items.reduce((a, i) => a + i.price, 0);
  if (g.items.length > 0 && Math.abs(sum - g.total) < 0.011) return PERFECT + g.items.length;
  const closeness = g.total > 0 ? Math.max(0, 1 - Math.abs(sum - g.total) / g.total) : 0;
  return closeness * 100 + g.items.length;
}
