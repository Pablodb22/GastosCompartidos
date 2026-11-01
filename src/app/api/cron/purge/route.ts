import { purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";

/**
 * Tarea diaria (vercel.json). Elimina los gastos fuera de la ventana de conservación.
 * Se ejecuta a diario pero solo borra algo el día 15 (o en la primera ejecución
 * posterior, si alguna fallase). Vercel envía "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const retention = getRetention();
  const deleted = await purgeExpired(retention);
  return Response.json({
    ok: true,
    deleted,
    keptFrom: retention.cutoffDate,
    nextPurgeDate: retention.nextPurgeDate,
  });
}
