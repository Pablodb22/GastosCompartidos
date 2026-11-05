"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editExpense, type EditExpenseState } from "@/app/actions";
import { ProductsEditor, sumItems, toInput, type ItemRow } from "@/components/products-editor";
import { beneficiaryOf, formatPct, parseAmount, type Expense } from "@/lib/calc";
import { FIXED_TYPES, RENT, SECTIONS, type PersonId, type Section } from "@/lib/config";

type Props = {
  expense: Expense;
  names: Record<PersonId, string>;
  minDate: string;
  maxDate: string;
};

const SECTION_EMOJI: Record<Section, string> = {
  fijos: "🏠",
  comida: "🛒",
  ocio: "🎉",
};

/** Botón ✏️ de cada gasto: abre una ventana con todos sus datos para corregirlos. */
export function EditExpenseButton({ expense, names, minDate, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Editar ${expense.concepto}`}
        title="Editar"
        className="rounded-full p-2 text-slate-300 transition hover:-rotate-12 hover:bg-violet-50 hover:text-violet-600"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
        </svg>
      </button>

      {/*
        La ventana y el aviso se pintan en <body>: dentro de la tarjeta, su desenfoque
        (backdrop-filter) los encerraría y otras tarjetas los taparían.
      */}
      {saved &&
        createPortal(
          <p
            role="status"
            className="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-sm rounded-full bg-emerald-500 px-5 py-3 text-center text-sm font-extrabold text-white shadow-lg sm:left-auto"
          >
            ✨ ¡Cambios guardados!
          </p>,
          document.body,
        )}

      {open &&
        createPortal(
          <EditDialog
            expense={expense}
            names={names}
            minDate={minDate}
            maxDate={maxDate}
            onClose={close}
            onSaved={() => {
              setOpen(false);
              setSaved(true);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function EditDialog({
  expense: e,
  names,
  minDate,
  maxDate,
  onClose,
  onSaved,
}: Props & { onClose: () => void; onSaved: () => void }) {
  const [state, action, pending] = useActionState<EditExpenseState, FormData>(async (prev, formData) => {
    const result = await editExpense(prev, formData);
    if (result.ok) onSaved();
    return result;
  }, {});

  const [section, setSection] = useState<Section>(e.seccion);
  const [concepto, setConcepto] = useState(e.concepto);
  const [amount, setAmount] = useState(toInput(e.importe));
  const [items, setItems] = useState<ItemRow[]>(() =>
    (e.productos ?? []).map((p, i) => ({
      id: i,
      name: p.nombre,
      price: toInput(p.importe),
    })),
  );
  const nextId = useRef(items.length);
  const [showProducts, setShowProducts] = useState(items.length > 0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const who = beneficiaryOf(e);
  const isRent = e.seccion === "fijos" && e.concepto === RENT;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeSection = (next: Section) => {
    setSection(next);
    // En gastos fijos el concepto es un tipo de la lista; al salir de ahí se deja como estaba.
    if (next === "fijos" && !FIXED_TYPES.includes(concepto as (typeof FIXED_TYPES)[number])) setConcepto(RENT);
  };

  const productsJson = JSON.stringify(
    items
      .filter((it) => it.name.trim() || it.price.trim())
      .map((it) => ({
        nombre: it.name.trim(),
        importe: parseAmount(it.price),
      })),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-violet-950/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`editar-${e.id}`}
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-left shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={`editar-${e.id}`} className="font-display text-gradient text-2xl font-semibold">
            ✏️ Editar gasto
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-violet-50 hover:text-violet-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="seccion" value={section} />
          <input type="hidden" name="productos" value={productsJson} />

          <fieldset>
            <legend className="label">Apartado</legend>
            <div className="grid grid-cols-3 gap-2">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={section === s.id}
                  onClick={() => changeSection(s.id)}
                  className={`rounded-2xl border-2 px-2 py-2 text-sm font-extrabold transition ${
                    section === s.id
                      ? "border-violet-500 bg-violet-500 text-white shadow-md"
                      : "border-violet-100 bg-white text-slate-600 hover:border-violet-300"
                  }`}
                >
                  {SECTION_EMOJI[s.id]} {s.id === "fijos" ? "Fijos" : s.id === "comida" ? "Compra" : "Ocio"}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <div>
              <label htmlFor={`editar-concepto-${e.id}`} className="label">
                {section === "fijos" ? "Tipo" : "Descripción"}
              </label>
              {section === "fijos" ? (
                <select
                  id={`editar-concepto-${e.id}`}
                  name="concepto"
                  value={concepto}
                  onChange={(ev) => setConcepto(ev.target.value)}
                  className="input"
                >
                  {FIXED_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`editar-concepto-${e.id}`}
                  name="concepto"
                  required
                  maxLength={120}
                  value={concepto}
                  onChange={(ev) => setConcepto(ev.target.value)}
                  className="input"
                />
              )}
            </div>
            <div>
              <label htmlFor={`editar-importe-${e.id}`} className="label">
                Importe (€)
              </label>
              <input
                id={`editar-importe-${e.id}`}
                name="importe"
                inputMode="decimal"
                autoComplete="off"
                required
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
                className="input text-right font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`editar-fecha-${e.id}`} className="label">
              Fecha
            </label>
            <input
              id={`editar-fecha-${e.id}`}
              name="fecha"
              type="date"
              required
              min={minDate}
              max={maxDate}
              defaultValue={e.fecha}
              className="input"
            />
          </div>

          <fieldset>
            <legend className="label">¿Quién lo pagó?</legend>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((p) => (
                <label
                  key={p}
                  className={`flex cursor-pointer items-center justify-center rounded-full border-2 border-violet-100 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-violet-200 has-checked:text-white has-checked:shadow-md has-focus-visible:ring-4 has-focus-visible:ring-brand-100 ${
                    p === 1
                      ? "has-checked:border-violet-500 has-checked:bg-violet-500"
                      : "has-checked:border-pink-500 has-checked:bg-pink-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="pagadoPor"
                    value={p}
                    defaultChecked={e.pagadoPor === p}
                    className="sr-only"
                  />
                  <span className="truncate">{names[p]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {section === "ocio" ? (
            <fieldset>
              <legend className="label">¿Para quién es?</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["pareja", "1", "2"] as const).map((o) => (
                  <label
                    key={o}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-amber-200 bg-white px-2 py-2 text-sm font-bold text-slate-600 transition hover:border-amber-300 has-checked:border-amber-400 has-checked:bg-amber-400 has-checked:text-white has-checked:shadow-md has-focus-visible:ring-4 has-focus-visible:ring-amber-100"
                  >
                    <input type="radio" name="para" value={o} defaultChecked={String(who) === o} className="sr-only" />
                    <span aria-hidden="true">{o === "pareja" ? "💑" : "🙋"}</span>
                    <span className="truncate">{o === "pareja" ? "Pareja" : names[Number(o) as PersonId]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <input type="hidden" name="para" value="pareja" />
          )}

          {section === "fijos" && concepto === RENT && (
            <p className="text-xs font-semibold text-slate-500">
              💡{" "}
              {isRent
                ? `Se mantiene el reparto con el que se registró (${names[1]} ${formatPct(e.porcentaje1)} · ${names[2]} ${formatPct(100 - e.porcentaje1)}).`
                : "El alquiler se repartirá según los sueldos actuales."}
            </p>
          )}

          {/* Con productos, el editor se ve directamente; sin ellos, se puede abrir para añadirlos. */}
          {showProducts ? (
            <ProductsEditor
              items={items}
              sum={sumItems(items)}
              total={parseAmount(amount)}
              onChange={setItems}
              onAdd={() => setItems((list) => [...list, { id: nextId.current++, name: "", price: "" }])}
              onUseSum={() => setAmount(toInput(sumItems(items)))}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowProducts(true)}
              className="text-sm font-bold text-violet-600 transition hover:text-violet-800"
            >
              🧾 ＋ Añadir productos (opcional)
            </button>
          )}

          {e.saldado && (
            <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              ✅ Este gasto está marcado como pagado y seguirá así. Puedes cambiarlo desde la lista.
            </p>
          )}

          {state.error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
              😬 {state.error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className="btn-secondary sm:flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="btn-primary sm:flex-1">
              {pending ? "Guardando…" : "💾 Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
