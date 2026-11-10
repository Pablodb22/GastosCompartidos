"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const keyFor = (year: number) => `wrapped-banner-${year}`;

function useDismissed(year: number) {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return localStorage.getItem(keyFor(year)) === "1";
      } catch {
        return false;
      }
    },
    () => true, // en el servidor no se pinta: así no hay parpadeo si ya se había cerrado
  );
}

/** Aviso en la portada de diciembre. Se puede cerrar; el Wrapped sigue en su pestaña. */
export function WrappedBanner({ year }: { year: number }) {
  const storedDismissed = useDismissed(year);
  const [dismissed, setDismissed] = useState(false);
  if (storedDismissed || dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-violet-700 via-fuchsia-600 to-orange-500 p-4 pr-12 text-white shadow-lg sm:p-5 sm:pr-14">
      <span aria-hidden="true" className="absolute -top-2 right-10 text-6xl opacity-20">
        🎁
      </span>
      <p className="font-display text-xl font-semibold sm:text-2xl">¡Ya está aquí vuestro Wrapped {year}!</p>
      <p className="mt-0.5 text-sm font-semibold text-white/90">Vuestro año en euros, con humor y en formato historias.</p>
      <Link
        href={`/wrapped/ver?anio=${year}`}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-violet-800 shadow transition hover:-translate-y-0.5"
      >
        ▶️ Verlo ahora
      </Link>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => {
          try {
            localStorage.setItem(keyFor(year), "1");
          } catch {}
          setDismissed(true);
        }}
        className="absolute top-3 right-3 rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
