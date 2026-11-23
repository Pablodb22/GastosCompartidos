"use client";

import { useEffect, useRef, useState } from "react";
import { setMe } from "@/app/actions";
import { IconCheck } from "@/components/icons";
import type { PersonId } from "@/lib/config";

/**
 * «¿Quién eres?»: se elige una vez en cada móvil y se recuerda. No es una cuenta: solo hace que
 * la app hable en primera persona («Lucía te debe…») y marque «Pagado por: tú» por defecto.
 */
export function WhoAmI({ names, me }: { names: Record<PersonId, string>; me: PersonId | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={me ? `Estás usando la app como ${names[me]}. Cambiar` : "¿Quién eres?"}
        className={
          me
            ? `flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-extrabold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand ${me === 1 ? "bg-p1" : "bg-p2"}`
            : "flex h-10 items-center rounded-xl bg-brand-soft px-3 text-[13px] font-extrabold text-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        {me ? names[me].slice(0, 1).toUpperCase() : "¿Quién eres?"}
      </button>

      {open && (
        <div role="menu" aria-label="¿Quién eres?" className="pop-in absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-line bg-white p-2 shadow-xl">
          <p className="px-3 pt-1.5 pb-2 text-xs font-bold text-mute">Elige quién usa este móvil</p>
          {([1, 2] as const).map((p) => (
            <form key={p} action={setMe}>
              <input type="hidden" name="yo" value={p} />
              <button
                type="submit"
                role="menuitemradio"
                aria-checked={me === p}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-bold transition hover:bg-field"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-white ${p === 1 ? "bg-p1" : "bg-p2"}`}>
                  {names[p].slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{names[p]}</span>
                {me === p && <IconCheck className="h-4 w-4 text-brand" />}
              </button>
            </form>
          ))}
          <p className="px-3 pt-2 pb-1.5 text-[11.5px] leading-snug font-medium text-mute">
            Solo cambia cómo te habla la app en este móvil. No es una cuenta.
          </p>
        </div>
      )}
    </div>
  );
}
