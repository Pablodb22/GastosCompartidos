"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { todayInAppZone } from "@/lib/periods";
import { availableWrappedYear } from "@/lib/wrapped";

const subscribe = () => () => {};
// Se mira la fecha de hoy al cargar (en el servidor no se pinta, para no depender de la fecha al compilar).
const available = () => availableWrappedYear(todayInAppZone()) !== null;

/** Pestaña «Wrapped»: solo existe del 1 de diciembre al 31 de octubre del año siguiente. */
export function WrappedNavLink({ active }: { active: boolean }) {
  const show = useSyncExternalStore(subscribe, available, () => false);
  if (!show) return null;
  return (
    <Link
      href="/wrapped"
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm font-extrabold transition ${
        active ? "bg-violet-950 text-white shadow-md" : "text-violet-700 hover:bg-violet-100"
      }`}
    >
      <span aria-hidden="true">🎁</span> Wrapped
    </Link>
  );
}
