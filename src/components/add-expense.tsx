"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createExpense, type ExpenseFormState } from "@/app/actions";
import { IconCamera, IconClose, IconInfo, IconPlus } from "@/components/icons";
import { toast } from "@/components/toast";
import { formatEUR, formatPct, parseAmount } from "@/lib/calc";
import { FIXED_TYPES, GYM, RENT, canBeIndividual, type PersonId, type Section } from "@/lib/config";

export const OPEN_ADD_EVENT = "app-open-add";
export const OPEN_SCANNER_EVENT = "app-open-scanner";

type Props = {
  names: Record<PersonId, string>;
  me: PersonId | null;
  defaultDate: string;
  minDate: string;
  maxDate: string;
  /** Porcentaje del alquiler de la persona 1 según sueldos (null si faltan). */
  rentPct: number | null;
};

const TYPES: { id: Section; label: string }[] = [
  { id: "comida", label: "Compra" },
  { id: "ocio", label: "Ocio" },
  { id: "fijos", label: "Fijo" },
];

/** Botón «Añadir gasto» (escritorio) y botón flotante (móvil) que abren la hoja de nuevo gasto. */
export function AddExpense(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_ADD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_EVENT, onOpen);
  }, []);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary hidden md:inline-flex">
        <IconPlus className="h-5 w-5" /> Añadir gasto
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Añadir gasto"
        className="fixed right-4 bottom-[88px] z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_22px_rgba(0,122,255,0.4)] transition hover:bg-brand-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand md:hidden"
      >
        <IconPlus className="h-7 w-7" />
      </button>
      {open && createPortal(<Sheet {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Sheet({ names, me, defaultDate, minDate, maxDate, rentPct, onClose }: Props & { onClose: () => void }) {
  const close = useCallback(() => onClose(), [onClose]);
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(async (prev, fd) => {
    const result = await createExpense(prev, fd);
    if (result.ok) {
      toast("Apuntado. Otro más para el Wrapped ✨");
      close();
    }
    return result;
  }, {});
  const v = state.values;
  const [section, setSection] = useState<Section>("comida");
  const [fixedType, setFixedType] = useState<string>(RENT);
  const [amount, setAmount] = useState(v?.importe ?? "");
  const [payer, setPayer] = useState<PersonId>(me ?? 1);
  const [para, setPara] = useState<"pareja" | "1" | "2">("pareja");
  const ref = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    amountRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

  const askWho = canBeIndividual(section, section === "fijos" ? fixedType : "");
  const who = askWho ? para : "pareja";
  const value = parseAmount(amount);
  const label = (p: PersonId) => (p === me ? "Tú" : names[p]);
  const mine = me ?? 1;
  const other: PersonId = mine === 1 ? 2 : 1;

  let note: string;
  if (who !== "pareja") {
    note = `Es solo de ${Number(who) === me ? "ti" : names[Number(who) as PersonId]}: no se reparte.`;
  } else if (section === "fijos" && fixedType === RENT) {
    note =
      rentPct === null
        ? "El alquiler se reparte según los sueldos (indícalos en Ajustes)."
        : `Se reparte según sueldos: ${names[1]} ${formatPct(rentPct)} · ${names[2]} ${formatPct(100 - rentPct)}.`;
  } else if (value !== null && value > 0) {
    note = `Se reparte a partes iguales: ${formatEUR(value / 2)} cada uno.`;
  } else {
    note = "Se reparte a partes iguales.";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 md:items-center md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        className="sheet-up max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pt-2.5 pb-6 shadow-2xl md:rounded-3xl"
      >
        <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#d9d4cc] md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="add-title" className="text-[19px] font-extrabold tracking-tight">
            Nuevo gasto
          </h2>
          <button type="button" onClick={close} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f0eb] text-ink2">
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>

        <form action={action} className="mt-3.5 space-y-3.5">
          <input type="hidden" name="seccion" value={section} />
          <input type="hidden" name="pagadoPor" value={payer} />
          <input type="hidden" name="para" value={who} />

          <div className="seg" role="group" aria-label="Tipo de gasto">
            {TYPES.map((t) => (
              <button key={t.id} type="button" aria-pressed={section === t.id} onClick={() => setSection(t.id)} className="seg-item">
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-center">
            <label htmlFor="add-importe" className="text-xs font-bold text-mute">
              Importe
            </label>
            <div className="flex items-baseline justify-center gap-1.5">
              <input
                ref={amountRef}
                id="add-importe"
                name="importe"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: `${Math.max(3, amount.length + 0.5)}ch` }}
                className="max-w-56 min-w-16 border-0 bg-transparent p-0 text-center text-[46px] leading-[1.15] font-extrabold tracking-tight tabular-nums outline-none placeholder:text-[#cfc9c0] focus-visible:outline-none"
              />
              <span className="text-[34px] font-bold text-mute" aria-hidden="true">
                €
              </span>
            </div>
          </div>

          {section === "fijos" ? (
            <div>
              <label htmlFor="add-concepto" className="label">
                Tipo
              </label>
              <select id="add-concepto" name="concepto" value={fixedType} onChange={(e) => setFixedType(e.target.value)} className="input">
                {FIXED_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="add-concepto" className="label">
                Descripción
              </label>
              <input
                id="add-concepto"
                name="concepto"
                type="text"
                maxLength={120}
                required
                placeholder={section === "ocio" ? "Ej.: Cena japonés" : "Ej.: Compra semanal"}
                defaultValue={v?.concepto ?? ""}
                className="input"
              />
            </div>
          )}

          <div className="grid grid-cols-[1fr_1.1fr] gap-3">
            <div>
              <label htmlFor="add-fecha" className="label">
                Fecha
              </label>
              <input id="add-fecha" name="fecha" type="date" required min={minDate} max={maxDate} defaultValue={v?.fecha ?? defaultDate} className="input" />
            </div>
            <div>
              <span className="label">Pagado por</span>
              <div className="seg h-[46px]! rounded-xl!" role="group" aria-label="Pagado por">
                {[mine, other].map((p) => (
                  <button key={p} type="button" aria-pressed={payer === p} onClick={() => setPayer(p)} className="seg-item rounded-[9px]! py-0! truncate px-1">
                    {label(p)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {askWho && (
            <div>
              <span className="label">¿Para quién es?</span>
              <div className="seg" role="group" aria-label="¿Para quién es?">
                <button type="button" aria-pressed={para === "pareja"} onClick={() => setPara("pareja")} className="seg-item">
                  Los dos
                </button>
                <button type="button" aria-pressed={para === String(mine)} onClick={() => setPara(String(mine) as "1" | "2")} className="seg-item">
                  {me ? "Solo yo" : `Solo ${names[mine]}`}
                </button>
                <button type="button" aria-pressed={para === String(other)} onClick={() => setPara(String(other) as "1" | "2")} className="seg-item truncate">
                  Solo {names[other]}
                </button>
              </div>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug font-medium text-mute">
            <IconInfo className="mt-0.5 h-[15px] w-[15px] shrink-0" />
            {note}
            {section === "fijos" && fixedType === GYM && " El gimnasio puede ser de una sola persona."}
          </p>

          {state.error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
              {state.error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                close();
                window.dispatchEvent(new Event(OPEN_SCANNER_EVENT));
              }}
              className="btn-secondary h-[50px] px-4"
            >
              <IconCamera className="h-5 w-5" /> Ticket
            </button>
            <button type="submit" disabled={pending} className="btn-primary h-[50px] flex-1 text-[15.5px]">
              {pending ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
          <p className="text-center text-[12.5px] font-medium text-mute">Otro más para el Wrapped ✨</p>
        </form>
      </div>
    </div>
  );
}
