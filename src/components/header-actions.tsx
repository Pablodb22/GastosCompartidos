import { connection } from "next/server";
import { WhoAmI } from "@/components/who-am-i";
import { getCouple } from "@/lib/expenses";
import { getMe } from "@/lib/me";

/** Acción de la barra superior: «¿quién eres?» (solo cuando la pareja ya está configurada). */
export async function HeaderActions() {
  await connection();
  const [couple, me] = await Promise.all([getCouple(), getMe()]);
  if (!couple.configured) return null;
  return <WhoAmI key={me ?? "nadie"} names={couple.names} me={me} />;
}
