import "server-only";
import { cookies } from "next/headers";
import type { PersonId } from "./config";

/** Cookie con quién usa este móvil ("1" o "2"). No es una cuenta: solo personaliza los textos y los valores por defecto. */
export const ME_COOKIE = "yo";

export async function getMe(): Promise<PersonId | null> {
  const value = (await cookies()).get(ME_COOKIE)?.value;
  return value === "1" ? 1 : value === "2" ? 2 : null;
}
