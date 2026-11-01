export type PersonId = 1 | 2;
export type Section = "fijos" | "comida" | "ocio";

export const SECTIONS: { id: Section; title: string; description: string }[] = [
  {
    id: "fijos",
    title: "Gastos fijos",
    description: "Alquiler, internet, agua y luz.",
  },
  {
    id: "comida",
    title: "Compras de comida",
    description: "Supermercado, mercado y compras del hogar.",
  },
  {
    id: "ocio",
    title: "Ocio",
    description: "Restaurantes, planes, viajes y tiempo libre.",
  },
];

export const SECTION_TITLES: Record<Section, string> = {
  fijos: "Gastos fijos",
  comida: "Compras de comida",
  ocio: "Ocio",
};

export const FIXED_TYPES = ["Alquiler", "Internet", "Agua", "Luz"] as const;
export type FixedType = (typeof FIXED_TYPES)[number];

/** Único gasto que se reparte en proporción a los sueldos. */
export const RENT: FixedType = "Alquiler";

export const isSection = (v: unknown): v is Section =>
  v === "fijos" || v === "comida" || v === "ocio";
