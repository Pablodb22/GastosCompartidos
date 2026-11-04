"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { createExpense, type ExpenseFormState } from "@/app/actions";
import type { PersonId } from "@/lib/config";
import { parseAmount } from "@/lib/calc";
import { parseReceipt, type ReceiptGuess } from "@/lib/receipt";

type Props = {
  names: Record<PersonId, string>;
  today: string;
  minDate: string;
  maxDate: string;
};

type Step =
  | { name: "closed" }
  | { name: "pick"; error?: string }
  | { name: "reading"; progress: number; label: string; preview: string }
  | { name: "review"; preview: string; text: string; guess: ReceiptGuess; dateNote?: string };

const toInput = (n: number) => n.toFixed(2).replace(".", ",");
const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Prepara la foto para el OCR: la reduce (más rápido) y la pasa a escala de
 * grises con más contraste (los tickets térmicos suelen salir desvaídos).
 */
async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const STATUS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector…",
  "initializing tesseract": "Preparando el lector…",
  "loading language traineddata": "Descargando el idioma (solo la primera vez)…",
  "initializing api": "Preparando el lector…",
  "recognizing text": "Leyendo el ticket…",
};

export function TicketScanner({ names, today, minDate, maxDate }: Props) {
  const [step, setStep] = useState<Step>({ name: "closed" });
  const [saved, setSaved] = useState<number | undefined>();
  const workerRef = useRef<Worker | null>(null);
  const previewRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const setPreview = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
  }, []);

  const close = useCallback(() => {
    setPreview(null);
    setStep({ name: "closed" });
  }, [setPreview]);

  // Guarda con la misma acción que los formularios; si va bien, cierra y avisa.
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(async (prev, formData) => {
    const result = await createExpense(prev, formData);
    if (result.ok) {
      close();
      setSaved(result.submission);
    }
    return result;
  }, {});

  // El aviso de «guardado» desaparece solo.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(undefined), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  // Escape cierra la ventana; el lector se libera al salir de la página.
  useEffect(() => {
    if (step.name === "closed") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [step.name, close]);

  useEffect(
    () => () => {
      void workerRef.current?.terminate();
      setPreview(null);
    },
    [setPreview],
  );

  async function read(file: File) {
    const preview = URL.createObjectURL(file);
    setPreview(preview);
    setStep({ name: "reading", progress: 0, label: "Preparando la foto…", preview });
    try {
      const canvas = await prepareImage(file);
      if (!workerRef.current) {
        const { createWorker } = await import("tesseract.js");
        workerRef.current = await createWorker("spa", 1, {
          logger: (m) =>
            setStep((s) =>
              s.name === "reading"
                ? { ...s, progress: m.progress, label: STATUS[m.status] ?? "Leyendo el ticket…" }
                : s,
            ),
        });
      }
      const { data } = await workerRef.current.recognize(canvas);
      const guess = parseReceipt(data.text);
      let dateNote: string | undefined;
      if (guess.date && (guess.date < minDate || guess.date > maxDate)) {
        dateNote = `La fecha del ticket (${fmtDate(guess.date)}) está fuera de los meses que guarda la app; se ha puesto la de hoy.`;
        guess.date = null;
      }
      setStep({ name: "review", preview, text: data.text, guess, dateNote });
    } catch {
      setPreview(null);
      setStep({
        name: "pick",
        error: "No se ha podido leer la foto. Comprueba la conexión (la primera vez hay que descargar el lector) e inténtalo de nuevo.",
      });
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file) void read(file);
  };

  return (
    <>
      <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setStep({ name: "pick" })}>
        📸 Escanear ticket
      </button>

      {saved && (
        <p
          role="status"
          className="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-sm rounded-full bg-emerald-500 px-5 py-3 text-center text-sm font-extrabold text-white shadow-lg sm:left-auto"
        >
          ✨ ¡Gasto del ticket guardado!
        </p>
      )}

      {step.name !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-violet-950/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && step.name !== "reading" && close()}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-title"
            tabIndex={-1}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="ticket-title" className="font-display text-gradient text-2xl font-semibold">
                📸 Escanear ticket
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-2 text-slate-400 transition hover:bg-violet-50 hover:text-violet-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {step.name === "pick" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-500">
                  Haz una foto al ticket bien estirado, con buena luz y que se vea el total. Lo leemos y solo tendrás que
                  revisarlo.
                </p>
                <label className="btn-primary w-full cursor-pointer py-4 text-base">
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
                  📷 Hacer foto
                </label>
                <label className="btn-secondary w-full cursor-pointer py-3">
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                  🖼️ Elegir de la galería
                </label>
                {step.error && (
                  <p role="alert" className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                    😬 {step.error}
                  </p>
                )}
                <p className="text-xs font-semibold text-slate-400">
                  🔒 La foto se lee en tu móvil y no se sube a ningún sitio. La primera vez se descarga el lector (unos 6 MB); después queda guardado.
                </p>
              </div>
            )}

            {step.name === "reading" && (
              <div className="space-y-4 text-center" aria-live="polite">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={step.preview} alt="Foto del ticket" className="mx-auto max-h-56 rounded-2xl object-contain shadow" />
                <p className="font-bold text-violet-700">{step.label}</p>
                <div
                  className="h-3 overflow-hidden rounded-full bg-violet-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(step.progress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-linear-to-r from-violet-600 to-fuchsia-500 transition-all"
                    style={{ width: `${Math.max(5, step.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {step.name === "review" && (
              <ReviewForm
                key={step.preview}
                step={step}
                names={names}
                today={today}
                minDate={minDate}
                maxDate={maxDate}
                action={action}
                pending={pending}
                error={state.error}
                onRetake={() => {
                  setPreview(null);
                  setStep({ name: "pick" });
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ReviewForm({
  step,
  names,
  today,
  minDate,
  maxDate,
  action,
  pending,
  error,
  onRetake,
}: {
  step: Extract<Step, { name: "review" }>;
  names: Record<PersonId, string>;
  today: string;
  minDate: string;
  maxDate: string;
  action: (fd: FormData) => void;
  pending: boolean;
  error?: string;
  onRetake: () => void;
}) {
  const { guess } = step;
  const [section, setSection] = useState<"comida" | "ocio" | null>(guess.section);
  const [items, setItems] = useState<ItemRow[]>(() =>
    guess.items.map((it, i) => ({
      id: i,
      name: it.name,
      price: toInput(it.price),
      discount: it.discount,
      readPrice: toInput(it.price),
    })),
  );
  const nextId = useRef(guess.items.length);
  const itemsSum = sumItems(items);
  // Si el ticket no trae total, el importe sigue a la suma de productos hasta que lo toques.
  const [amountInput, setAmountInput] = useState<string | null>(guess.total !== null ? toInput(guess.total) : null);
  const amount = amountInput ?? (itemsSum > 0 ? toInput(itemsSum) : "");
  const setAmount = (v: string) => setAmountInput(v);

  // Solo se envían las filas con algo escrito; el servidor revisa nombre y precio.
  const productsJson = JSON.stringify(
    items
      .filter((it) => it.name.trim() || it.price.trim())
      .map((it) => ({ nombre: it.name.trim(), importe: parseAmount(it.price) })),
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="seccion" value={section ?? ""} />
      <input type="hidden" name="productos" value={productsJson} />

      {/* 1. Importe total de la factura */}
      <section aria-labelledby="ticket-total-titulo" className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
        <img src={step.preview} alt="Foto del ticket" className="h-24 w-16 shrink-0 rounded-xl object-cover shadow" />
        <div className="min-w-0 flex-1">
          <label id="ticket-total-titulo" htmlFor="ticket-importe" className="label">
            💶 Importe total de la factura
          </label>
          <input
            id="ticket-importe"
            name="importe"
            inputMode="decimal"
            autoComplete="off"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="input font-display text-right text-3xl! tabular-nums"
          />
          <p className="mt-1 text-[11px] font-semibold text-slate-400">
            {guess.total !== null ? "Leído del ticket. Si no es correcto, cámbialo." : "No hemos encontrado el total: escríbelo."}
          </p>
          {guess.candidates.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Otros importes del ticket">
              {guess.candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAmount(toInput(c))}
                  className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold tabular-nums transition ${
                    amount === toInput(c)
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-violet-100 bg-white text-violet-700 hover:border-violet-300"
                  }`}
                >
                  {toInput(c)} €
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. Productos con su importe (descuentos ya aplicados) */}
      <ProductsEditor
        items={items}
        sum={itemsSum}
        total={parseAmount(amount)}
        onChange={setItems}
        onAdd={() => setItems((list) => [...list, { id: nextId.current++, name: "", price: "" }])}
        onUseSum={() => setAmount(toInput(itemsSum))}
      />

      {/* 3. Datos del gasto */}
      <section aria-labelledby="ticket-datos" className="space-y-4 border-t-2 border-violet-50 pt-4">
        <h3 id="ticket-datos" className="font-display text-lg font-semibold text-violet-950">
          📝 Datos del gasto
        </h3>

        <fieldset>
          <legend className="label">¿Es ocio o compra?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["comida", "🛒 Compra"],
                ["ocio", "🎉 Ocio"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={section === value}
                onClick={() => setSection(value)}
                className={`rounded-2xl border-2 px-3 py-2.5 text-base font-extrabold transition ${
                  section === value
                    ? value === "comida"
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                      : "border-pink-500 bg-pink-500 text-white shadow-md"
                    : "border-violet-100 bg-white text-slate-600 hover:border-violet-300"
                }`}
              >
                {label}
              </button>
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
                  <input type="radio" name="para" value={o} defaultChecked={o === "pareja"} className="sr-only" />
                  <span aria-hidden="true">{o === "pareja" ? "💑" : "🙋"}</span>
                  <span className="truncate">{o === "pareja" ? "Pareja" : names[Number(o) as PersonId]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <>
            <input type="hidden" name="para" value="pareja" />
            {section === "comida" && (
              <p className="-mt-1 text-xs font-semibold text-slate-500">💑 La compra es para los dos: se reparte a medias.</p>
            )}
          </>
        )}

        <fieldset>
          <legend className="label">¿Quién lo pagó?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((p) => (
              <label
                key={p}
                className={`flex cursor-pointer items-center justify-center rounded-full border-2 border-violet-100 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-violet-200 has-checked:text-white has-checked:shadow-md has-focus-visible:ring-4 has-focus-visible:ring-brand-100 ${
                  p === 1 ? "has-checked:border-violet-500 has-checked:bg-violet-500" : "has-checked:border-pink-500 has-checked:bg-pink-500"
                }`}
              >
                <input type="radio" name="pagadoPor" value={p} defaultChecked={p === 1} className="sr-only" />
                <span className="truncate">{names[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3">
          <div>
            <label htmlFor="ticket-concepto" className="label">
              Descripción
            </label>
            <input
              id="ticket-concepto"
              name="concepto"
              required
              maxLength={120}
              defaultValue={guess.merchant ?? ""}
              placeholder={section === "ocio" ? "Ej.: Cena en restaurante" : "Ej.: Compra semanal"}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="ticket-fecha" className="label">
              Fecha
            </label>
            <input
              id="ticket-fecha"
              name="fecha"
              type="date"
              required
              min={minDate}
              max={maxDate}
              defaultValue={guess.date ?? today}
              className="input"
            />
          </div>
        </div>
        {step.dateNote && <p className="-mt-2 text-xs font-semibold text-amber-700">⚠️ {step.dateNote}</p>}
      </section>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          😬 {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={onRetake} className="btn-secondary sm:flex-1">
          🔄 Repetir foto
        </button>
        <button type="submit" disabled={pending || !section} className="btn-primary sm:flex-1">
          {pending ? "Guardando…" : section ? "✅ Guardar gasto" : "Elige ocio o compra"}
        </button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-violet-400">Ver el texto leído</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-2xl bg-slate-50 p-3 font-mono whitespace-pre-wrap text-slate-600">
          {step.text.trim() || "(no se ha leído texto)"}
        </pre>
      </details>
    </form>
  );
}

// ---------- Productos del ticket ----------

/** `discount` y `readPrice`: descuento leído del ticket y precio con el que se leyó (para saber si se ha tocado). */
type ItemRow = { id: number; name: string; price: string; discount?: number; readPrice?: string };

const sumItems = (items: ItemRow[]) =>
  Math.round(items.reduce((a, it) => a + (parseAmount(it.price) ?? 0), 0) * 100) / 100;

function ProductsEditor({
  items,
  sum,
  total,
  onChange,
  onAdd,
  onUseSum,
}: {
  items: ItemRow[];
  sum: number;
  total: number | null;
  onChange: (fn: (list: ItemRow[]) => ItemRow[]) => void;
  onAdd: () => void;
  onUseSum: () => void;
}) {
  const update = (id: number, patch: Partial<ItemRow>) =>
    onChange((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: number) => onChange((list) => list.filter((it) => it.id !== id));
  const mismatch = items.length > 0 && total !== null && Math.abs(total - sum) >= 0.01;

  return (
    <section aria-labelledby="ticket-productos" className="rounded-2xl bg-violet-50/60 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 id="ticket-productos" className="label mb-0!">
          🧾 Productos {items.length > 0 && `(${items.length})`}
        </h3>
        <span className="text-xs font-bold text-slate-500">
          Suma: <span className="text-slate-900 tabular-nums">{toInput(sum)} €</span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-2 text-center text-xs font-semibold text-slate-500">
          No se han reconocido productos. Puedes añadirlos a mano (es opcional).
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {items.map((it, i) => {
            const badPrice = it.price.trim() !== "" && (parseAmount(it.price) ?? 0) <= 0;
            const missingPrice = it.name.trim() !== "" && it.price.trim() === "";
            const missingName = it.name.trim() === "" && it.price.trim() !== "";
            // El aviso del descuento solo se muestra mientras el precio sea el leído.
            const showDiscount = !!it.discount && it.price === it.readPrice;
            return (
              <li key={it.id}>
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label={`Nombre del producto ${i + 1}`}
                    value={it.name}
                    maxLength={80}
                    placeholder="Nombre del producto"
                    onChange={(e) => update(it.id, { name: e.target.value })}
                    className={`input w-auto! min-w-0 flex-1 py-1.5! ${missingName ? "border-red-300!" : ""}`}
                  />
                  <input
                    aria-label={`Precio del producto ${i + 1}`}
                    value={it.price}
                    inputMode="decimal"
                    placeholder="0,00"
                    onChange={(e) => update(it.id, { price: e.target.value })}
                    className={`input w-20! shrink-0 py-1.5! text-right tabular-nums ${
                      badPrice || missingPrice ? "border-red-300!" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    aria-label={`Eliminar ${it.name || `producto ${i + 1}`}`}
                    title="Eliminar producto"
                    className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
                {showDiscount && (
                  <p className="mt-0.5 mr-9 text-right text-[11px] font-bold text-emerald-700">
                    🏷️ Descuento de {toInput(it.discount!)} € ya aplicado
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded-full border-2 border-dashed border-violet-200 py-1.5 text-sm font-bold text-violet-600 transition hover:border-violet-400 hover:bg-white"
      >
        ＋ Añadir producto
      </button>

      {mismatch && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <span>
            ⚠️ La suma de productos ({toInput(sum)} €) no coincide con el total ({toInput(total!)} €). Puede que algún
            producto o descuento no se haya leído bien.
          </span>
          <button
            type="button"
            onClick={onUseSum}
            className="rounded-full bg-white px-2.5 py-1 font-extrabold text-amber-800 shadow-sm hover:bg-amber-100"
          >
            Usar la suma
          </button>
        </div>
      )}
    </section>
  );
}
