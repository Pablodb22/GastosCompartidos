import { formatEUR } from "./calc";
import { formatMonth, monthShortName } from "./periods";
import type { CategoryKey, PersonStats, WrappedData } from "./wrapped";

/**
 * Convierte las estadísticas del Wrapped en historias (diapositivas) con humor.
 * Todo el texto sale de aquí: el visor solo pinta. Los chistes se eligen con una
 * semilla fija (año + diapositiva), así al volver a verlo salen los mismos.
 * Las diapositivas sin datos suficientes se omiten.
 */

export type ThemeKey = "violet" | "pink" | "blue" | "orange" | "teal" | "rose" | "grape" | "magenta";

export type Tone = "a" | "b" | "c" | "p1" | "p2";

export type Visual =
  | { type: "bars"; items: { label: string; value: number; display: string; highlight?: boolean }[] }
  | { type: "ranking"; items: { label: string; value: string; note?: string }[] }
  | { type: "split"; parts: { label: string; value: number; display: string; tone: Tone }[] }
  | { type: "tiles"; items: { label: string; value: string; note?: string }[] };

export type Big = { value: number; kind: "eur" | "int"; suffix?: string };

export type Slide = {
  id: string;
  theme: ThemeKey;
  emoji: string;
  kicker?: string;
  title?: string;
  big?: Big;
  text?: string;
  visual?: Visual;
  footnote?: string;
  /** Duración en milisegundos (por defecto, 6500). */
  ms?: number;
  /** Última diapositiva: muestra los botones de cerrar y volver a verlo. */
  final?: boolean;
};

// ---------- Utilidades ----------

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

const intFmt = new Intl.NumberFormat("es-ES");
const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Formateador de la cifra grande: sin decimales a partir de 1.000 € (decidido por el valor final, para que no «salte» al contar). */
export function bigFormatter(big: Big): (n: number) => string {
  const withDecimals = big.kind === "eur" && big.value < 1000;
  return (n) => {
    if (big.kind === "int") return intFmt.format(Math.round(n));
    return withDecimals ? formatEUR(n) : eur0.format(Math.round(n));
  };
}

const eur = (n: number) => (n >= 1000 ? eur0.format(Math.round(n)) : formatEUR(n));
const dayMonth = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
};
const dayMonthYear = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
};
const fullDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (m: string) => formatMonth(m).split(" ")[0].toLowerCase();
const plural = (n: number, one: string, many: string) => `${intFmt.format(n)} ${n === 1 ? one : many}`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const WEEKDAYS_PL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const WEEKDAY_JOKES = [
  "Los lunes, y sin empezar la semana con calma. Valientes. 😅",
  "El martes: el día en que nadie mira el banco. 🙈",
  "Miércoles: mitad de semana, mitad de cartera. ✂️",
  "El jueves, que es el viernes pequeñito. Y la tarjeta lo nota. 💳",
  "Viernes: «hoy no se cocina». Os entendemos perfectamente. 🍕",
  "Sábado de súper, plan y a vivir. Como debe ser. 🎉",
  "Domingo: sofá, manta y pedir la cena. Sin juzgar. 🛋️",
];

const MONTH_JOKES = [
  "Enero: propósitos de año nuevo… y ticket de las rebajas. 🛍️",
  "Febrero, mes del amor (y de la cena de San Valentín). 💘",
  "Marzo: ¿primavera o simplemente ganas de gastar? 🌸",
  "Abril, aguas mil… y planes mil. ☔",
  "Mayo: terracitas, calor y la cartera llorando. 🍻",
  "Junio: empieza el verano y la cartera se despide. 🌞",
  "Julio: vacaciones. Y no, no cuentan como inversión. 🏖️",
  "Agosto: playa, chiringuito y cuenta en modo avión. ✈️",
  "Septiembre: la vuelta al cole y la vuelta a las facturas. 📚",
  "Octubre: otoño, mantita y pedir comida. 🍂",
  "Noviembre: el Black Friday os miró… y le devolvisteis la mirada. 🛒",
  "Diciembre: Navidad, turrón y ticket infinito. 🎄",
];

const SPECIAL_DAYS: Record<string, string> = {
  "01-01": "Año nuevo, gasto nuevo. 🥂",
  "01-06": "Día de Reyes: se nota. 👑",
  "02-14": "San Valentín, claro. 💘",
  "12-24": "Nochebuena, ¿qué esperabais? 🎄",
  "12-25": "Navidad, ¿qué esperabais? 🎄",
  "12-31": "Nochevieja: cerrar el año a lo grande. 🍇",
};

const CATEGORY: Record<CategoryKey, { label: string; emoji: string }> = {
  comida: { label: "La comida", emoji: "🛒" },
  ocioPareja: { label: "Los planes en pareja", emoji: "💑" },
  ocioPropio: { label: "Los caprichos propios", emoji: "🙋" },
  gimnasio: { label: "El gimnasio", emoji: "🏋️" },
};

const EQUIVALENTS = [
  { price: 2, many: "cañas 🍺", quip: "Sin contar las tapas." },
  { price: 1.4, many: "cafés ☕", quip: "Con leche, sin culpa." },
  { price: 12, many: "menús del día 🍽️", quip: "Con postre y todo." },
  { price: 9, many: "entradas de cine 🎬", quip: "Las palomitas, aparte." },
];

const PRODUCT_JOKES: [RegExp, string][] = [
  [/leche/, "Por vuestra nevera corre un río de leche. 🥛"],
  [/pl[aá]tano/, "Más plátanos que un zoológico. 🍌"],
  [/cerveza|ca[nñ]a/, "Hidratación asegurada. 🍺"],
  [/huevo/, "Sois una granja de huevos… y de ideas. 🥚"],
  [/papel/, "Previsión ante todo: ni un apocalipsis os pilla sin papel. 🧻"],
  [/pan\b/, "El pan nuestro de cada día, literalmente. 🥖"],
  [/caf[eé]/, "Sin café no hay presupuesto que valga. ☕"],
  [/pizza/, "Sois de pizza. No se discute. 🍕"],
  [/aceite/, "Con tanto aceite, ya sois casi de la tierra. 🫒"],
  [/yogur|yogurt/, "Vuestras bacterias buenas os lo agradecen. 🥣"],
];

// ---------- Perfil de la pareja ----------

export type Archetype = { key: string; name: string; emoji: string; text: string };

export function archetypeOf(d: WrappedData): Archetype {
  const flex = d.bySection.comida + d.bySection.ocio;
  const flexCount = d.weekdays.reduce((a, w) => a + w.count, 0);
  const avgFlex = flexCount > 0 ? flex / flexCount : 0;
  if (flex > 0 && d.bySection.ocio / flex >= 0.45) {
    return { key: "disfrutones", name: "Los Disfrutones", emoji: "🎉", text: "Vivís como si mañana no existiera la factura de la luz." };
  }
  if (flex > 0 && d.bySection.comida / flex >= 0.8) {
    return { key: "foodies", name: "Los Foodies", emoji: "🍝", text: "Vuestra nevera tiene más vida social que vosotros." };
  }
  if (flexCount >= 40 && avgFlex < 18) {
    return { key: "hormiguitas", name: "Las Hormiguitas", emoji: "🐜", text: "Muchos gastitos, pocos sustos. Vais sumando sin hacer ruido." };
  }
  if (d.total > 0 && d.bySection.fijos / d.total >= 0.6) {
    return { key: "caseros", name: "Los Caseros", emoji: "🏠", text: "Vuestros gastos tienen techo. Literalmente." };
  }
  return { key: "equilibristas", name: "Los Equilibristas", emoji: "⚖️", text: "Un poco de todo y nada de más. Sospechosamente sano." };
}

// ---------- Diapositivas ----------

export function buildSlides(d: WrappedData): Slide[] {
  const choose = <T>(id: string, options: T[]): T => options[hash(`${d.year}:${id}`) % options.length];
  const [n1, n2] = [d.names[1], d.names[2]];
  const slides: Slide[] = [];
  const push = (s: Omit<Slide, "theme"> & { theme?: ThemeKey }) => slides.push({ ...s, theme: s.theme ?? "pink" });

  // 1. Portada
  push({
    id: "intro",
    theme: "violet",
    emoji: "🎁",
    kicker: `${n1} & ${n2}`,
    title: `Vuestro Wrapped ${d.year}`,
    text: choose("intro", [
      "Hemos revisado cada euro. Sí, también ese. 👀",
      "Spotify tiene vuestras canciones. Nosotros, vuestros tickets. 🧾",
      "Preparaos: esto va a doler un poquito. Con cariño. 💜",
    ]),
    footnote: `${dayMonthYear(d.from)} – ${dayMonthYear(d.to)} · ${plural(d.count, "gasto", "gastos")}`,
    ms: 5500,
  });

  // 2. Total
  {
    const eq = choose("equivalent", EQUIVALENTS);
    let footnote: string | undefined;
    // Se compara enero–noviembre de este año con enero–noviembre del anterior (lo que hay de los dos).
    if (d.prev && d.prev.coverageMonths >= 6 && d.prev.currentMonths >= 6 && d.prev.total > 0) {
      const delta = Math.round(((d.prev.currentTotal - d.prev.total) / d.prev.total) * 100);
      footnote =
        delta > 5
          ? `Un ${delta} % más que en ${d.prev.year} (de enero a noviembre). La inflación os mira con orgullo. 📈`
          : delta < -5
            ? `Un ${Math.abs(delta)} % menos que en ${d.prev.year} (de enero a noviembre). ¡Esa es la actitud (y el tupper)! 📉`
            : `Casi igual que en ${d.prev.year} (de enero a noviembre). Constantes hasta en esto. 🎯`;
    }
    push({
      id: "total",
      emoji: "💸",
      kicker: "En total, entre los dos, os habéis gastado",
      big: { value: d.total, kind: "eur" },
      text: `Eso son ${intFmt.format(Math.round(d.total / eq.price))} ${eq.many}. ${eq.quip}`,
      footnote,
    });
  }

  // 3. Reparto
  {
    const { fijos, comida, ocio } = d.bySection;
    const share = (v: number) => pct(v, d.total);
    let text = "Un reparto de lo más equilibrado. Casi sospechoso. ⚖️";
    if (share(ocio) >= 25) text = `Un ${share(ocio)} % en ocio. Sois más de vivir que de ahorrar, y nos encanta. 🎉`;
    else if (share(fijos) >= 60) {
      text = choose("split-fijos", [
        "Más de la mitad se va en techo y facturas. El casero os manda un abrazo. 🏠",
        "Entre alquiler y facturas, la vida social es un lujo. Menos mal que compartís sofá. 🛋️",
      ]);
    } else if (share(comida) >= 30) text = `Un ${share(comida)} % en comida. Vuestra nevera os adora. 🍝`;
    push({
      id: "split",
      theme: "blue",
      emoji: "🥧",
      title: "¿En qué se os fue el dinero?",
      visual: {
        type: "split",
        parts: [
          { label: "🏠 Gastos fijos", value: fijos, display: `${share(fijos)} %`, tone: "a" },
          { label: "🛒 Comida", value: comida, display: `${share(comida)} %`, tone: "b" },
          { label: "🎉 Ocio", value: ocio, display: `${share(ocio)} %`, tone: "c" },
        ],
      },
      text,
    });
  }

  // 4. Mes más caro (solo con meses completos y con gastos)
  {
    const ranked = d.months.filter((m) => m.complete && m.total > 0);
    if (ranked.length >= 2) {
      const max = ranked.reduce((a, m) => (m.total > a.total ? m : a));
      const min = ranked.reduce((a, m) => (m.total < a.total ? m : a));
      push({
        id: "months",
        theme: "orange",
        emoji: "📅",
        kicker: `${cap(monthName(max.month))} fue vuestro mes más caro`,
        big: { value: max.total, kind: "eur" },
        visual: {
          type: "bars",
          items: d.months.map((m) => ({
            label: monthShortName(m.month),
            value: m.total,
            display: eur(m.total),
            highlight: m.month === max.month,
          })),
        },
        text: MONTH_JOKES[Number(max.month.slice(5)) - 1],
        footnote: `El más tranquilo: ${monthName(min.month)} (${eur(min.total)}).`,
      });
    }
  }

  // 5. Día de la semana
  {
    const totalCount = d.weekdays.reduce((a, w) => a + w.count, 0);
    if (totalCount >= 8) {
      const top = d.weekdays.reduce((best, w, i) => (w.spend > d.weekdays[best].spend ? i : best), 0);
      const low = d.weekdays.reduce((best, w, i) => (w.spend < d.weekdays[best].spend ? i : best), 0);
      push({
        id: "weekday",
        theme: "teal",
        emoji: "🗓️",
        kicker: "En compras y planes",
        title: `Sois de ${WEEKDAYS[top]}`,
        visual: {
          type: "bars",
          items: d.weekdays.map((w, i) => ({
            label: WEEKDAYS_SHORT[i],
            value: w.spend,
            display: eur(w.spend),
            highlight: i === top,
          })),
        },
        text: WEEKDAY_JOKES[top],
        footnote: `${eur(d.weekdays[top].spend)} los ${WEEKDAYS_PL[top]}; lo más tranquilo, los ${WEEKDAYS_PL[low]} (${eur(d.weekdays[low].spend)}).`,
      });
    }
  }

  // 6. Día estrella
  if (d.starDay && d.starDay.amount >= 20) {
    const s = d.starDay;
    const special = SPECIAL_DAYS[s.date.slice(5)];
    const joke =
      special ??
      (s.amount < 60
        ? "Vuestro día más gastón fue de lo más comedido. Aplausos. 👏"
        : choose("star", [
            "Ese día la tarjeta echó humo. 🔥",
            "Nadie recuerda cómo acabó el día, pero el extracto sí. 🧾",
            "Seguro que valió la pena. Seguro. 😅",
          ]));
    push({
      id: "star",
      theme: "rose",
      emoji: "🔥",
      kicker: "El día que tiraron la casa por la ventana",
      title: cap(fullDay(s.date)),
      big: { value: s.amount, kind: "eur" },
      text: joke,
      footnote: s.concepts.length > 1 ? `Entre ${s.concepts.slice(0, -1).join(", ")} y ${s.concepts.at(-1)}.` : s.concepts[0],
    });
  }

  // 7. Sitio favorito
  if (d.merchants[0] && d.merchants[0].visits >= 2) {
    const top = d.merchants[0];
    push({
      id: "merchant",
      theme: "teal",
      emoji: "🛒",
      kicker: "Vuestro sitio favorito para comprar",
      title: top.name,
      visual: {
        type: "ranking",
        items: d.merchants.slice(0, 3).map((m) => ({ label: m.name, value: plural(m.visits, "visita", "visitas"), note: eur(m.total) })),
      },
      text:
        top.visits >= 20
          ? "Ya podrían ponerle vuestro nombre a un pasillo. 🪧"
          : top.visits >= 10
            ? "En caja os saludan por vuestro nombre. Seguro. 👋"
            : "Fieles hasta el último ticket. 🧾",
    });
  }

  // 8. Plan estrella
  if (d.plans[0]) {
    const top = d.plans[0];
    push({
      id: "plans",
      theme: "pink",
      emoji: "🎟️",
      kicker: "Vuestro plan estrella",
      title: top.name,
      text:
        top.times >= 4
          ? `${plural(top.times, "vez", "veces")}, ${eur(top.total)}. A estas alturas ya os tienen mesa reservada. 🍽️`
          : `${plural(top.times, "vez", "veces")}, ${eur(top.total)}. Pocas veces, pero con estilo. ✨`,
      visual: {
        type: "ranking",
        items: d.plans.slice(0, 5).map((p) => ({ label: p.name, value: eur(p.total), note: `${p.times}×` })),
      },
    });
  }

  // 9. Producto estrella (solo con tickets escaneados)
  if (d.products.length >= 3 && d.products[0].times >= 3) {
    const top = d.products[0];
    const key = top.name.toLowerCase();
    const joke =
      PRODUCT_JOKES.find(([re]) => re.test(key))?.[1] ??
      choose("product", ["Lo compráis como si se fuera a acabar el mundo. 🛒", "Un día os darán un diploma. O un descuento. 🏅"]);
    push({
      id: "products",
      theme: "orange",
      emoji: "🧺",
      kicker: "Vuestro producto estrella",
      title: top.name,
      visual: {
        type: "ranking",
        items: d.products.slice(0, 5).map((p) => ({ label: p.name, value: `${intFmt.format(p.times)}×` })),
      },
      text: joke,
      footnote: `${plural(d.productStats.lines, "producto escaneado", "productos escaneados")}, ${d.productStats.distinct} distintos.`,
    });
  }

  // 10. Récords
  if (d.records.shop || d.records.ocio) {
    const items: { label: string; value: string; note?: string }[] = [];
    if (d.records.shop) items.push({ label: "🛒 Compra más cara", value: eur(d.records.shop.amount), note: `${d.records.shop.concept} · ${dayMonth(d.records.shop.date)}` });
    if (d.records.ocio) items.push({ label: "🎉 Plan más caro", value: eur(d.records.ocio.amount), note: `${d.records.ocio.concept} · ${dayMonth(d.records.ocio.date)}` });
    push({
      id: "records",
      theme: "blue",
      emoji: "🏆",
      title: "Los récords de la cartera",
      visual: { type: "ranking", items },
      text:
        d.records.shop && d.records.shop.amount >= 100
          ? "Alguien dijo «solo vamos a por cuatro cosas». Mentira. 🤥"
          : "Ni un solo susto en el súper. Compradores de manual. 🧠",
    });
  }

  // 11. Quién ha sacado más la tarjeta
  {
    const a = d.paidBy[1];
    const b = d.paidBy[2];
    if (a + b > 0) {
      const leader: 1 | 2 = a >= b ? 1 : 2;
      const other: 1 | 2 = leader === 1 ? 2 : 1;
      const diff = Math.abs(a - b) / (a + b);
      push({
        id: "paid",
        theme: "magenta",
        emoji: "💳",
        title: "¿Quién ha sacado más la tarjeta?",
        visual: {
          type: "split",
          parts: [
            { label: n1, value: a, display: eur(a), tone: "p1" },
            { label: n2, value: b, display: eur(b), tone: "p2" },
          ],
        },
        text:
          diff < 0.08
            ? "Un empate técnico. Os turnáis como un reloj suizo. ⏱️"
            : diff < 0.25
              ? `${d.names[leader]} ha puesto un poco más. Nada grave… de momento. 😉`
              : `${d.names[leader]} es oficialmente el banco de la pareja. 🏦 ${d.names[other]}, ¿invitas alguna vez? 😏`,
      });
    }
  }

  // 12-13. Cada uno
  for (const p of [1, 2] as const) {
    const s: PersonStats = d.people[p];
    if (s.share <= 0) continue;
    const name = d.names[p];
    const otherName = d.names[p === 1 ? 2 : 1];
    const otherOwn = d.people[p === 1 ? 2 : 1].own;
    const tiles: { label: string; value: string; note?: string }[] = [];
    if (s.top) {
      const c = CATEGORY[s.top.key];
      tiles.push({ label: "Lo que más le gusta gastar", value: `${c.emoji} ${c.label}`, note: eur(s.top.amount) });
    }
    tiles.push({ label: "Caprichos solo suyos", value: eur(s.own) });
    if (s.ownTop) tiles.push({ label: "Su capricho más caro", value: s.ownTop.name, note: eur(s.ownTop.amount) });
    else tiles.push({ label: "Ha pagado de su bolsillo", value: eur(d.paidBy[p]) });

    let text: string;
    if (s.own === 0) text = "Cero caprichos propios. O es un santo, o no apunta los tickets. 😇";
    else if (s.own > otherOwn * 1.3 && s.own >= 30) text = `${eur(s.own)} en caprichos propios. ${otherName}, solo ${eur(otherOwn)}. Nadie juzga (la app sí). 😏`;
    else if (otherOwn > s.own * 1.3 && otherOwn >= 30) text = `Cartera de monje: ${eur(s.own)} en caprichos. ${otherName} se ha dado más. 🧘`;
    else text = `${eur(s.own)} en caprichos propios. Con moderación, como todo lo bueno. 🍷`;

    push({
      id: `person-${p}`,
      theme: p === 1 ? "grape" : "magenta",
      emoji: "🙋",
      kicker: name,
      title: "Su parte del año",
      big: { value: s.share, kind: "eur" },
      visual: { type: "tiles", items: tiles },
      text,
    });
  }

  // 14. Racha sin gastar
  if (d.streak) {
    const s = d.streak;
    if (s.days >= 3) {
      push({
        id: "streak",
        theme: "teal",
        emoji: "🧘",
        kicker: "Vuestra mayor racha",
        big: { value: s.days, kind: "int", suffix: "días sin gastar ni un euro" },
        text:
          s.days >= 7
            ? `Del ${dayMonth(s.from)} al ${dayMonth(s.to)}. ¡Qué autocontrol! (O se os olvidó apuntar. 🤫)`
            : `Del ${dayMonth(s.from)} al ${dayMonth(s.to)}. ¿Retiro espiritual o nevera vacía? 🧘`,
      });
    } else {
      push({
        id: "streak",
        theme: "teal",
        emoji: "🏅",
        title: `Nunca pasasteis más de ${plural(s.days, "día", "días")} sin gastar`,
        text: "Gastar: vuestro deporte favorito. 🏅",
      });
    }
  }

  // 15. Cuentas pendientes
  {
    const { balance, count, settled } = d.pending;
    if (Math.abs(balance) < 0.005) {
      push({
        id: "pending",
        theme: "blue",
        emoji: "🕊️",
        title: "Cuentas saldadas",
        text: "Ni un euro pendiente. Sois la pareja más ordenada del barrio. 🕊️",
        footnote: settled > 0 ? `${eur(settled)} ya devueltos a lo largo del año.` : undefined,
      });
    } else {
      const debtor: 1 | 2 = balance > 0 ? 2 : 1;
      const creditor: 1 | 2 = debtor === 1 ? 2 : 1;
      push({
        id: "pending",
        theme: "blue",
        emoji: "💌",
        kicker: `${d.names[debtor]} le debe a ${d.names[creditor]}`,
        big: { value: Math.abs(balance), kind: "eur" },
        text: "Esto no es una amenaza: es un recordatorio con cariño. 💌",
        footnote: `${plural(count, "gasto pendiente", "gastos pendientes")}${settled > 0 ? ` · ${eur(settled)} ya devueltos` : ""}.`,
      });
    }
  }

  // 16. Perfil
  {
    const a = archetypeOf(d);
    push({
      id: "archetype",
      theme: "violet",
      emoji: a.emoji,
      kicker: `Vuestro perfil financiero ${d.year}`,
      title: `Sois ${a.name}`,
      text: a.text,
    });
  }

  // 17. Cierre
  push({
    id: "outro",
    theme: "grape",
    emoji: "💜",
    title: "Gracias por un año de cuentas claras",
    text: choose("outro", [
      "Amor largo, cuentas cortas (y claras).",
      "Nos vemos el 1 de diciembre del año que viene. Id ahorrando. 🐷",
      "Lo importante no es lo que gastáis, sino con quién lo gastáis. (Pero también lo que gastáis.)",
    ]),
    final: true,
    ms: 8000,
  });

  // Que no haya dos diapositivas seguidas del mismo color (salvo las de cada persona, que llevan el suyo).
  const PALETTE: ThemeKey[] = ["pink", "blue", "orange", "teal", "rose", "violet", "grape", "magenta"];
  for (let i = 1; i < slides.length; i++) {
    if (slides[i].theme !== slides[i - 1].theme || slides[i].id.startsWith("person-")) continue;
    const next = slides[i + 1]?.theme;
    slides[i].theme = PALETTE.find((t) => t !== slides[i - 1].theme && t !== next) ?? slides[i].theme;
  }
  return slides;
}

/** Texto plano de una diapositiva (lectores de pantalla y compartir). */
export function slideText(s: Slide): string {
  const parts = [s.kicker, s.title];
  if (s.big) parts.push(`${bigFormatter(s.big)(s.big.value)}${s.big.suffix ? ` ${s.big.suffix}` : ""}`);
  parts.push(s.text);
  if (s.visual?.type === "ranking" || s.visual?.type === "tiles") {
    parts.push(s.visual.items.map((i) => `${i.label}: ${i.value}${i.note ? ` (${i.note})` : ""}`).join("; "));
  }
  if (s.visual?.type === "split") parts.push(s.visual.parts.map((p) => `${p.label}: ${p.display}`).join("; "));
  if (s.visual?.type === "bars") parts.push(s.visual.items.map((i) => `${i.label}: ${i.display}`).join("; "));
  parts.push(s.footnote);
  return parts
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/[.\s]+$/, ""))
    .join(". ");
}

/** Texto corto para compartir. */
export function shareText(d: WrappedData): string {
  const a = archetypeOf(d);
  return `🎁 Wrapped ${d.year} de ${d.names[1]} & ${d.names[2]}: ${eur(d.total)} en ${plural(d.count, "gasto", "gastos")}. Somos ${a.name} ${a.emoji}`;
}
