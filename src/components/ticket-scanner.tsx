"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Worker } from "tesseract.js";
import { createExpense, type ExpenseFormState } from "@/app/actions";
import { OPEN_SCANNER_EVENT } from "@/components/add-expense";
import { IconClose } from "@/components/icons";
import { toast } from "@/components/toast";
import type { PersonId } from "@/lib/config";
import { ProductsEditor, sumItems, toInput, type ItemRow } from "@/components/products-editor";
import { parseAmount } from "@/lib/calc";
import { prepareImage, type Prep } from "@/lib/ocr";
import { PERFECT, parseReceipt, receiptScore, type ReceiptGuess } from "@/lib/receipt";

type Props = {
  names: Record<PersonId, string>;
  me: PersonId | null;
  today: string;
  minDate: string;
  maxDate: string;
};

type Step =
  | { name: "closed" }
  | { name: "pick"; error?: string }
  | { name: "reading"; progress: number; label: string; preview: string }
  | { name: "review"; preview: string; text: string; guess: ReceiptGuess; dateNote?: string };

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/** Tratamientos de la foto, en orden de preferencia (medido con fotos de prueba). */
const PREPS: Prep[] = ["flatten", "binarize", "stretch"];

const STATUS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector…",
  "initializing tesseract": "Preparando el lector…",
  "loading language traineddata": "Descargando el idioma (solo la primera vez)…",
  "initializing api": "Preparando el lector…",
  "recognizing text": "Leyendo el ticket…",
};

export function TicketScanner({ names, me, today, minDate, maxDate }: Props) {
  const [step, setStep] = useState<Step>({ name: "closed" });
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
      toast("Gasto del ticket guardado ✨");
    }
    return result;
  }, {});

  // Se abre desde «Ticket» en la hoja de nuevo gasto.
  useEffect(() => {
    const onOpen = () => setStep({ name: "pick" });
    window.addEventListener(OPEN_SCANNER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCANNER_EVENT, onOpen);
  }, []);

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
      if (!workerRef.current) {
        const { createWorker, PSM } = await import("tesseract.js");
        workerRef.current = await createWorker("spa", 1, {
          logger: (m) =>
            setStep((s) =>
              s.name === "reading"
                ? { ...s, progress: m.progress, label: STATUS[m.status] ?? "Leyendo el ticket…" }
                : s,
            ),
        });
        // Bloque único: mantiene en la misma línea el nombre y el precio de cada producto.
        await workerRef.current.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      }

      // Primera lectura con la luz «aplanada». Si la suma de productos no cuadra con el
      // total, se repite con otros tratamientos de la foto y se queda la que mejor cuadre.
      let best: { text: string; guess: ReceiptGuess; score: number } | null = null;
      for (const [i, prep] of PREPS.entries()) {
        if (i > 0) setStep((s) => (s.name === "reading" ? { ...s, progress: 0, label: "Repasando el ticket…" } : s));
        const canvas = await prepareImage(file, prep);
        const { data } = await workerRef.current.recognize(canvas);
        const parsed = parseReceipt(data.text);
        const score = receiptScore(parsed);
        if (!best || score > best.score) best = { text: data.text, guess: parsed, score };
        if (score >= PERFECT) break;
      }
      const { text, guess } = best!;
      let dateNote: string | undefined;
      if (guess.date && (guess.date < minDate || guess.date > maxDate)) {
        dateNote = `La fecha del ticket (${fmtDate(guess.date)}) está fuera de los meses que guarda la app; se ha puesto la de hoy.`;
        guess.date = null;
      }
      setStep({ name: "review", preview, text, guess, dateNote });
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
      {step.name !== "closed" &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4"
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
              <h2 id="ticket-title" className="text-xl font-extrabold tracking-tight">
                Escanear ticket
              </h2>
              <button
                type="button"
                onClick={close}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f0eb] text-ink2"
                aria-label="Cerrar"
              >
                <IconClose className="h-[18px] w-[18px]" />
              </button>
            </div>

            {step.name === "pick" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink2">
                  Haz una foto al ticket bien estirado, con buena luz y que se vea el total. Lo leemos y solo tendrás que
                  revisarlo.
                </p>
                <label className="btn-primary w-full cursor-pointer py-4 text-base">
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
                  Hacer foto
                </label>
                <label className="btn-secondary w-full cursor-pointer py-3">
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                  Elegir de la galería
                </label>
                {step.error && (
                  <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
                    {step.error}
                  </p>
                )}
                <p className="text-xs font-semibold text-mute">
                  La foto se lee en tu móvil y no se sube a ningún sitio. La primera vez se descarga el lector (unos 6 MB); después queda guardado.
                </p>
              </div>
            )}

            {step.name === "reading" && (
              <div className="space-y-4 text-center" aria-live="polite">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={step.preview} alt="Foto del ticket" className="mx-auto max-h-56 rounded-2xl object-contain shadow" />
                <p className="font-bold text-brand">{step.label}</p>
                <div
                  className="h-3 overflow-hidden rounded-full bg-seg"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(step.progress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-brand transition-all"
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
                me={me}
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
        </div>,
        document.body,
      )}
    </>
  );
}

function ReviewForm({
  step,
  names,
  me,
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
  me: PersonId | null;
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
            Importe total de la factura
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
            className="input text-right text-3xl! font-extrabold tabular-nums"
          />
          <p className="mt-1 text-[11px] font-semibold text-mute">
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
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-brand hover:border-brand"
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
      <section aria-labelledby="ticket-datos" className="space-y-4 border-t border-line pt-4">
        <h3 id="ticket-datos" className="text-base font-extrabold">
          Datos del gasto
        </h3>

        <fieldset>
          <legend className="label">¿Es ocio o compra?</legend>
          <div className="seg" role="group" aria-label="Tipo de gasto">
            {(
              [
                ["comida", "Compra"],
                ["ocio", "Ocio"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={section === value} onClick={() => setSection(value)} className="seg-item">
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {section === "ocio" ? (
          <fieldset>
            <legend className="label">¿Para quién es?</legend>
            <div className="seg">
              {(["pareja", "1", "2"] as const).map((o) => (
                <label key={o} className="seg-item">
                  <input type="radio" name="para" value={o} defaultChecked={o === "pareja"} className="sr-only" />
                  <span className="truncate">{o === "pareja" ? "Los dos" : Number(o) === me ? "Solo yo" : `Solo ${names[Number(o) as PersonId]}`}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <>
            <input type="hidden" name="para" value="pareja" />
            {section === "comida" && (
              <p className="-mt-1 text-xs font-medium text-mute">La compra es para los dos: se reparte a medias.</p>
            )}
          </>
        )}

        <fieldset>
          <legend className="label">Pagado por</legend>
          <div className="seg">
            {([1, 2] as const).map((p) => (
              <label key={p} className="seg-item">
                <input type="radio" name="pagadoPor" value={p} defaultChecked={p === (me ?? 1)} className="sr-only" />
                <span className="truncate">{p === me ? "Tú" : names[p]}</span>
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
        {step.dateNote && <p className="-mt-2 text-xs font-semibold text-pend-fg">{step.dateNote}</p>}
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={onRetake} className="btn-secondary sm:flex-1">
          Repetir foto
        </button>
        <button type="submit" disabled={pending || !section} className="btn-primary sm:flex-1">
          {pending ? "Guardando…" : section ? "Guardar gasto" : "Elige ocio o compra"}
        </button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-mute">Ver el texto leído</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-field p-3 font-mono whitespace-pre-wrap text-ink2">
          {step.text.trim() || "(no se ha leído texto)"}
        </pre>
      </details>
    </form>
  );
}
