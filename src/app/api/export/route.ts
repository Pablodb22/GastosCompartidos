import { SECTION_TITLES } from "@/lib/config";
import { getCouple, listExpenses } from "@/lib/expenses";
import { getRetention, isValidMonthKey } from "@/lib/periods";

/** Descarga los gastos de un mes en CSV (compatible con Excel en español). */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("mes");
  const retention = getRetention();
  if (!isValidMonthKey(month) || !retention.months.includes(month)) {
    return Response.json({ error: "Mes no disponible" }, { status: 400 });
  }

  const [{ names }, expenses] = await Promise.all([getCouple(), listExpenses(month)]);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const lines = [
    ["Fecha", "Apartado", "Concepto", "Importe", "Pagado por", `Parte ${names[1]}`, `Parte ${names[2]}`]
      .map(esc)
      .join(";"),
    ...expenses
      .slice()
      .reverse()
      .map((e) => {
        const share1 = Math.round(e.importe * e.porcentaje1) / 100;
        return [
          e.fecha,
          SECTION_TITLES[e.seccion],
          esc(e.concepto),
          num(e.importe),
          esc(names[e.pagadoPor]),
          num(share1),
          num(e.importe - share1),
        ].join(";");
      }),
  ];

  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gastos-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
