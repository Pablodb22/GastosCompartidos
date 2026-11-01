"use client";

import { useActionState } from "react";
import { updateCouple, type CoupleFormState } from "@/app/actions";
import type { PersonId } from "@/lib/config";

type Props = {
  names: Record<PersonId, string>;
  salaries: Record<PersonId, number | null>;
  configured: boolean;
};

const toInput = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function CoupleForm({ names, salaries, configured }: Props) {
  const [state, action, pending] = useActionState<CoupleFormState, FormData>(updateCouple, {});

  return (
    <form action={action} className="space-y-4">
      {([1, 2] as const).map((p) => (
        <div key={p} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <div>
            <label htmlFor={`nombre${p}`} className="label">
              Nombre {p}
            </label>
            <input
              id={`nombre${p}`}
              name={`nombre${p}`}
              type="text"
              maxLength={40}
              required
              placeholder={p === 1 ? "Ej.: Pablo" : "Ej.: Lucía"}
              defaultValue={configured ? names[p] : ""}
              className="input"
            />
          </div>
          <div>
            <label htmlFor={`sueldo${p}`} className="label">
              Sueldo (€)
            </label>
            <input
              id={`sueldo${p}`}
              name={`sueldo${p}`}
              type="text"
              inputMode="decimal"
              required
              placeholder="0"
              defaultValue={toInput(salaries[p])}
              className="input text-right tabular-nums"
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500">
        Sueldo neto mensual. Solo se usa para repartir el alquiler y no se borra con la limpieza mensual.
      </p>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Datos guardados.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Guardando…" : configured ? "Guardar cambios" : "Guardar y empezar"}
      </button>
    </form>
  );
}
