"use client";

import { useFormStatus } from "react-dom";
import { regenerateWrapped } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full px-3 py-1.5 text-xs font-bold text-white/80 underline-offset-2 transition hover:bg-white/15 hover:text-white disabled:opacity-60"
    >
      {pending ? "Calculando…" : "🔄 Volver a generar"}
    </button>
  );
}

/** Recalcula el Wrapped con los gastos actuales (por ejemplo, tras importar gastos que faltaban). */
export function RegenerateWrapped({ year }: { year: number }) {
  return (
    <form
      action={regenerateWrapped}
      onSubmit={(e) => {
        if (!confirm(`¿Volver a calcular el Wrapped ${year} con los gastos actuales? Sustituirá al guardado.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="anio" value={year} />
      <Submit />
    </form>
  );
}
