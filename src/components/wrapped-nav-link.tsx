"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { IconGift } from "@/components/icons";
import { todayInAppZone } from "@/lib/periods";
import { availableWrappedYear } from "@/lib/wrapped";

const subscribe = () => () => {};
// Se mira la fecha de hoy al cargar (en el servidor no se pinta, para no depender de la fecha al compilar).
const available = () => availableWrappedYear(todayInAppZone()) !== null;

/**
 * Pestaña «Wrapped»: solo existe del 1 de diciembre al 31 de octubre del año siguiente.
 * `top` es la de escritorio; `bottom`, la de la barra inferior del móvil (con un punto de «nuevo»).
 */
export function WrappedNavLink({ active, variant }: { active: boolean; variant: "top" | "bottom" }) {
  const show = useSyncExternalStore(subscribe, available, () => false);
  if (!show) return null;

  if (variant === "bottom") {
    return (
      <Link
        href="/wrapped"
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] ${
          active ? "font-bold text-brand" : "font-semibold text-mute"
        }`}
      >
        <span className="relative flex">
          <IconGift className="h-[22px] w-[22px]" />
          {!active && <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-ocio" aria-hidden="true" />}
        </span>
        Wrapped
      </Link>
    );
  }
  return (
    <Link
      href="/wrapped"
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
        active ? "bg-brand-soft text-brand" : "text-ink2 hover:bg-seg"
      }`}
    >
      <IconGift className="h-[18px] w-[18px]" />
      Wrapped
    </Link>
  );
}
