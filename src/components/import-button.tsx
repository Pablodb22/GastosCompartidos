"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { importExpenses, type ImportState } from "@/app/actions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ImportButton() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importExpenses, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [dismissed, setDismissed] = useState<number | undefined>();
  const open = state.submission !== undefined && dismissed !== state.submission && !pending;

  // Los avisos de éxito sin errores se cierran solos.
  useEffect(() => {
    if (!state.submission || state.error || state.rowErrors?.length) return;
    const t = setTimeout(() => setDismissed(state.submission), 6000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
      <form ref={formRef} action={action} key={state.submission ?? 0}>
        <label
          className={`btn-secondary cursor-pointer whitespace-nowrap has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-fuchsia-300 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
          title="Importar gastos desde un Excel (.xlsx)"
        >
          <input
            type="file"
            name="archivo"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              if (e.currentTarget.files?.length) formRef.current?.requestSubmit();
            }}
          />
          {pending ? "⏳ Importando…" : "📥 Importar Excel"}
        </label>
      </form>

      {open && (
        <div
          role={state.error ? "alert" : "status"}
          className="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-md rounded-3xl border-2 border-white bg-white p-4 shadow-[0_16px_40px_-12px_rgb(124_58_237/0.45)] sm:left-auto"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              {state.error ? "😬" : state.imported || state.settled ? "🎉" : state.rowErrors?.length ? "🤔" : "👌"}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              {state.error ? (
                <p className="font-bold text-red-600">{state.error}</p>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold text-violet-950">
                    {state.imported
                      ? `¡${plural(state.imported, "gasto importado", "gastos importados")}!`
                      : state.settled
                        ? "¡Importación hecha!"
                        : "No se ha importado ningún gasto"}
                  </p>
                  {!!state.settled && (
                    <p className="font-semibold text-emerald-700">
                      ✅ {plural(state.settled, "gasto marcado", "gastos marcados")} como pagado.
                    </p>
                  )}
                  {!!state.duplicates && (
                    <p className="font-semibold text-slate-500">
                      {plural(state.duplicates, "gasto ya existía y se ha", "gastos ya existían y se han")} omitido.
                    </p>
                  )}
                  {!!state.rowErrors?.length && (
                    <div className="mt-2 rounded-2xl bg-amber-50 p-3">
                      <p className="font-bold text-amber-800">
                        {plural(state.rowErrors.length, "fila con errores", "filas con errores")} (no se han importado):
                      </p>
                      <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs font-semibold text-amber-900">
                        {state.rowErrors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDismissed(state.submission)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-violet-50 hover:text-violet-700"
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
