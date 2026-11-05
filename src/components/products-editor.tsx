"use client";

import { parseAmount } from "@/lib/calc";

/*
 * Lista editable de productos de un ticket (nombre y precio): se usa al
 * escanear un ticket y al editar un gasto ya guardado.
 */

export const toInput = (n: number) => n.toFixed(2).replace(".", ",");

/** `discount` y `readPrice`: descuento leído del ticket y precio con el que se leyó (para saber si se ha tocado). */
export type ItemRow = { id: number; name: string; price: string; discount?: number; readPrice?: string };

export const sumItems = (items: ItemRow[]) =>
  Math.round(items.reduce((a, it) => a + (parseAmount(it.price) ?? 0), 0) * 100) / 100;

export function ProductsEditor({
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
