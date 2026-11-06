export type PersonId = 1 | 2;
export type Section = "fijos" | "comida" | "ocio";

export const SECTIONS: { id: Section; title: string; description: string }[] = [
  {
    id: "fijos",
    title: "Gastos fijos",
    description: "Alquiler, internet, agua, luz y gimnasio.",
  },
  {
    id: "comida",
    title: "Compras de comida",
    description: "Supermercado, mercado y compras del hogar.",
  },
  {
    id: "ocio",
    title: "Ocio",
    description: "Planes en pareja o caprichos individuales.",
  },
];

export const SECTION_TITLES: Record<Section, string> = {
  fijos: "Gastos fijos",
  comida: "Compras de comida",
  ocio: "Ocio",
};

export const FIXED_TYPES = ["Alquiler", "Internet", "Agua", "Luz", "Gimnasio"] as const;
export type FixedType = (typeof FIXED_TYPES)[number];

/** Único gasto que se reparte en proporción a los sueldos. */
export const RENT: FixedType = "Alquiler";

/** Gasto fijo que puede ser de una sola persona (cada uno su cuota) o de los dos. */
export const GYM: FixedType = "Gimnasio";

/** Gastos que pueden ser de una sola persona: el ocio y el gimnasio. El resto es siempre de los dos. */
export const canBeIndividual = (seccion: Section, concepto: string) =>
  seccion === "ocio" || (seccion === "fijos" && concepto === GYM);

export const isSection = (v: unknown): v is Section =>
  v === "fijos" || v === "comida" || v === "ocio";
