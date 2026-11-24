import { beneficiaryOf, formatEUR, owedAmount, type Expense } from "./calc";
import type { PersonId } from "./config";
import type { MonthKey } from "./periods";
import { pieFor, shareOf } from "./stats";

/**
 * Consejos para ahorrar con los gastos del mes: unos sobre lo individual (de una persona) y
 * otros sobre lo de la pareja. Función pura: cada consejo sale de un dato real del mes.
 */

export type TipIcon = "ticket" | "cart" | "user" | "home" | "users" | "check";
export type Tip = { icon: TipIcon; title: string; text: string };

const eur = (n: number) => formatEUR(n);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function savingTips(
  all: Expense[],
  month: MonthKey,
  who: PersonId | "pareja",
  me: PersonId | null,
): { own: Tip[]; couple: Tip[] } {
  const monthList = all.filter((e) => e.fecha.startsWith(month));
  const own: Tip[] = [];
  const couple: Tip[] = [];

  if (who !== "pareja") {
    const you = who === me;
    const pie = pieFor(all, month, who);
    const topOcio = pie.slices.filter((s) => s.group === "ocio" && s.key !== "ocio:otros").sort((a, b) => b.value - a.value)[0];
    if (topOcio && topOcio.value >= 15) {
      own.push({
        icon: "ticket",
        title: `${topOcio.label} ${you ? "es tu mayor capricho" : "es su mayor capricho"}`,
        text: `${eur(topOcio.value)} este mes, el ${pct(topOcio.value, pie.ocioTotal)} % ${you ? "de tu" : "de su"} ocio. Buscar una opción más barata (tarde, día del espectador, oferta) suele recortar bastante sin renunciar al plan.`,
      });
    }
    const comida = pie.slices.find((s) => s.group === "comida");
    if (comida && comida.value >= 50) {
      own.push({
        icon: "cart",
        title: "Haz la lista antes de ir",
        text: `${you ? "Llevas" : "Lleva"} ${eur(comida.value)} en compra. Ir con lista y sin hambre recorta las compras impulsivas sin que se note.`,
      });
    }
    const solo = monthList.filter((e) => beneficiaryOf(e) === who).reduce((a, e) => a + e.importe, 0);
    if (solo > 0) {
      own.push({
        icon: "user",
        title: `${you ? "Ponte" : "Que se ponga"} un tope para caprichos`,
        text: `Los gastos solo ${you ? "tuyos" : "suyos"} suman ${eur(solo)}. Fijar una cifra mensual y, cuando llegue, plan gratis.`,
      });
    }
    const share = monthList.reduce((a, e) => a + shareOf(e, who), 0);
    if (own.length === 0 && share > 0) {
      own.push({ icon: "check", title: "Mes sin sustos", text: "Nada destaca demasiado este mes. Así da gusto." });
    }
  }

  // Pareja: solo gastos comunes.
  const common = monthList.filter((e) => beneficiaryOf(e) === "pareja");
  const total = common.reduce((a, e) => a + e.importe, 0);
  const fijos = common.filter((e) => e.seccion === "fijos").reduce((a, e) => a + e.importe, 0);
  if (total > 0 && pct(fijos, total) >= 50) {
    couple.push({
      icon: "home",
      title: "Revisad luz e internet",
      text: `Los fijos son el ${pct(fijos, total)} % de lo vuestro. Cambiar de tarifa una vez al año es el ahorro más fácil: se hace una vez y dura meses.`,
    });
  }
  const ocioPareja = common.filter((e) => e.seccion === "ocio").reduce((a, e) => a + e.importe, 0);
  if (ocioPareja >= 30) {
    couple.push({
      icon: "users",
      title: "Un plan casero al mes",
      text: `Habéis gastado ${eur(ocioPareja)} en ocio juntos. Alternar una cena fuera con una en casa os deja plan igual y baja la cuenta.`,
    });
  }
  const shops = new Map<string, { name: string; visits: number; total: number }>();
  for (const e of common.filter((x) => x.seccion === "comida")) {
    const k = e.concepto.trim().toLowerCase();
    const g = shops.get(k) ?? { name: e.concepto.trim(), visits: 0, total: 0 };
    g.visits++;
    g.total += e.importe;
    shops.set(k, g);
  }
  const topShop = [...shops.values()].sort((a, b) => b.visits - a.visits)[0];
  if (topShop && topShop.visits >= 3) {
    couple.push({
      icon: "cart",
      title: "Menos viajes al súper",
      text: `${topShop.visits} visitas a ${topShop.name} este mes (${eur(topShop.total)}). Una compra grande a la semana suele salir más barata que muchas pequeñas.`,
    });
  }
  const pending = monthList.filter((e) => owedAmount(e) > 0 && !e.saldado);
  if (pending.length >= 3) {
    couple.push({
      icon: "check",
      title: "Liquidad cada mes",
      text: `Hay ${pending.length} gastos por pagar entre vosotros. Marcarlos al cerrar el mes evita que se acumulen y cada uno sabe lo que le toca.`,
    });
  }
  if (couple.length === 0) couple.push({ icon: "check", title: "Vais bien", text: "Nada que recortar en lo vuestro este mes. Seguid así." });

  return { own, couple };
}
