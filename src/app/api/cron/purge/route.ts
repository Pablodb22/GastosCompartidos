import { ensureWrapped, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { availableWrappedYear } from "@/lib/wrapped";

/**
 * Tarea diaria (vercel.json):
 *  1. El 1 de diciembre crea y guarda el Wrapped del año (periodo: 1 dic anterior – 30 nov).
 *  2. El 1 de noviembre borra el Wrapped del año anterior, y el 1 de enero los gastos de más de
 *     dos años. Vercel envía "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const retention = getRetention();
  const year = availableWrappedYear(retention.today);
  const wrapped = year !== null && (await ensureWrapped(year, retention.today)) !== null ? year : null;
  const deleted = await purgeExpired(retention);
  return Response.json({
    ok: true,
    deleted,
    wrapped,
    keptFrom: retention.cutoffDate,
    nextPurgeDate: retention.nextPurgeDate,
  });
}
