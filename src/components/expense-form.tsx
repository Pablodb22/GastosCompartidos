"use client";

import { useActionState, useEffect, useRef } from "react";
import { createExpense, type ExpenseFormState } from "@/app/actions";
import { FIXED_TYPES, type PersonId, type Section } from "@/lib/config";

type Props = {
  section: Section;
  names: Record<PersonId, string>;
  defaultDate: string;
  minDate: string;
  maxDate: string;
};

const PLACEHOLDERS: Record<Section, string> = {
  fijos: "",
  comida: "Ej.: Compra semanal",
  ocio: "Ej.: Cena en restaurante",
};

export function ExpenseForm({ section, names, defaultDate, minDate, maxDate }: Props) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(createExpense, {});
  const amountRef = useRef<HTMLInputElement>(null);
  const v = state.values;
  const id = (name: string) => `${section}-${name}`;

  useEffect(() => {
    if (state.ok) amountRef.current?.focus();
  }, [state]);

  return (
    // La key reconstruye el formulario con los valores devueltos tras cada envío.
    <form key={state.submission ?? 0} action={action} className="space-y-3">
      <input type="hidden" name="seccion" value={section} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[150px_minmax(0,1fr)_120px]">
        <div>
          <label htmlFor={id("fecha")} className="label">
            Fecha
          </label>
          <input
            id={id("fecha")}
            name="fecha"
            type="date"
            required
            min={minDate}
            max={maxDate}
            defaultValue={v?.fecha ?? defaultDate}
            className="input"
          />
        </div>

        <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
          <label htmlFor={id("concepto")} className="label">
            {section === "fijos" ? "Tipo" : "Concepto"}
          </label>
          {section === "fijos" ? (
            <select id={id("concepto")} name="concepto" defaultValue={v?.concepto ?? "Alquiler"} className="input">
              {FIXED_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={id("concepto")}
              name="concepto"
              type="text"
              maxLength={120}
              placeholder={PLACEHOLDERS[section]}
              required
              defaultValue={v?.concepto ?? ""}
              className="input"
            />
          )}
        </div>

        <div>
          <label htmlFor={id("importe")} className="label">
            Importe (€)
          </label>
          <input
            ref={amountRef}
            id={id("importe")}
            name="importe"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            required
            defaultValue={v?.importe ?? ""}
            className="input text-right tabular-nums"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <fieldset className="flex-1">
          <legend className="label">Pagado por</legend>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((p) => (
              <label
                key={p}
                className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700 has-focus-visible:ring-3 has-focus-visible:ring-brand-100"
              >
                <input
                  type="radio"
                  name="pagadoPor"
                  value={p}
                  defaultChecked={(v?.pagadoPor ?? "1") === String(p)}
                  className="sr-only"
                />
                <span className="truncate">{names[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={pending} className="btn-primary sm:w-40">
          {pending ? "Guardando…" : "Añadir gasto"}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Gasto añadido.
        </p>
      )}
    </form>
  );
}
