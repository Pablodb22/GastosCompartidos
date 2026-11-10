import { ensureWrapped, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";

/**
 * Tarea diaria (vercel.json):
 *  1. El 1 de diciembre (o el primer día que se ejecute después) genera y guarda el Wrapped del año.
 *  2. Elimina los gastos de más de dos años. Solo borra algo el 1 de enero; antes de borrar un año
 *     se guarda su Wrapped, para poder seguir viéndolo.
 * Vercel envía "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const retention = getRetention();
  const wrapped: number[] = [];
  for (const year of [retention.currentYear - 1, retention.currentYear]) {
    // Solo genera el de los años ya desbloqueados (1 de diciembre) que aún no estén guardados.
    if (await ensureWrapped(year, retention.today)) wrapped.push(year);
  }
  const deleted = await purgeExpired(retention);
  return Response.json({
    ok: true,
    deleted,
    wrapped,
    keptFrom: retention.cutoffDate,
    nextPurgeDate: retention.nextPurgeDate,
  });
}
