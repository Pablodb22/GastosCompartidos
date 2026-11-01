import { getCouple, listExpenses } from "@/lib/expenses";
import { buildWorkbook } from "@/lib/excel";
import { getRetention, isValidMonthKey } from "@/lib/periods";

/** Descarga los gastos de un mes en Excel (.xlsx), listo para editar y volver a importar. */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("mes");
  const retention = getRetention();
  if (!isValidMonthKey(month) || !retention.months.includes(month)) {
    return Response.json({ error: "Mes no disponible" }, { status: 400 });
  }

  const [{ names }, expenses] = await Promise.all([getCouple(), listExpenses(month)]);
  const file = await buildWorkbook(expenses, names);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gastos-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
