"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteExpense } from "@/app/actions";
import { OPEN_ADD_EVENT } from "@/components/add-expense";
import { EditDialog } from "@/components/edit-expense";
import { IconChevronDown, IconDots, IconEdit, IconReceipt, IconTrash } from "@/components/icons";
import { KIND } from "@/components/icons";
import { SettleButton } from "@/components/settle-button";
import { beneficiaryOf, formatEUR, formatPct, owedAmount, type Expense } from "@/lib/calc";
import type { PersonId, Section } from "@/lib/config";
import { formatDate } from "@/lib/periods";

type Names = Record<PersonId, string>;
type Filter = "todos" | "pendientes" | "pagados";

export function Movements({
  expenses,
  names,
  me,
  minDate,
  maxDate,
}: {
  expenses: Expense[];
  names: Names;
  me: PersonId | null;
  minDate: string;
  maxDate: string;
}) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [kind, setKind] = useState<Section | "todos">("todos");
  const [editing, setEditing] = useState<Expense | null>(null);

  const pending = expenses.filter((e) => owedAmount(e) > 0 && !e.saldado).length;
  const paid = expenses.filter((e) => owedAmount(e) > 0 && e.saldado).length;
  const shown = expenses.filter((e) => kind === "todos" || e.seccion === kind).filter((e) =>
    filter === "todos" ? true : filter === "pendientes" ? owedAmount(e) > 0 && !e.saldado : owedAmount(e) > 0 && e.saldado,
  );

  return (
    <section aria-labelledby="movs" className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="movs" className="text-[17px] font-extrabold tracking-tight">
          Movimientos
        </h2>
        <span className="text-xs font-semibold text-mute">
          {expenses.length === 1 ? "1 gasto" : `${expenses.length} gastos`}
        </span>
      </div>

      {expenses.length > 0 && (
        <div className="seg mt-3" role="group" aria-label="Filtrar movimientos">
          {(
            [
              ["todos", "Todos"],
              ["pendientes", `Pendientes${pending ? ` ${pending}` : ""}`],
              ["pagados", `Pagados${paid ? ` ${paid}` : ""}`],
            ] as const
          ).map(([id, text]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="seg-item px-1.5 whitespace-nowrap">
              {text}
            </button>
          ))}
        </div>
      )}

      {expenses.length > 0 && (
        <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo">
          {(
            [
              ["todos", "Todos los tipos"],
              ["comida", "Compra"],
              ["ocio", "Ocio"],
              ["fijos", "Fijos"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
              className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink2 transition hover:bg-field aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:font-bold aria-pressed:text-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-[15px] font-bold">Mes en blanco. Qué sospechosamente tranquilo…</p>
          <p className="mt-1 text-sm font-medium text-mute">Apunta el primer gasto y empieza la cuenta.</p>
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_ADD_EVENT))} className="btn-primary mt-4">
            Añadir gasto
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm font-semibold text-mute">
          {kind !== "todos" || filter === "todos" ? "No hay gastos con este filtro." : filter === "pendientes" ? "Nada pendiente. Todo al día." : "Todavía no hay nada marcado como pagado."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line2">
          {shown.map((e) => (
            <Row key={e.id} expense={e} names={names} me={me} onEdit={() => setEditing(e)} />
          ))}
        </ul>
      )}

      {editing &&
        createPortal(
          <EditDialog
            key={editing.id}
            expense={editing}
            names={names}
            minDate={minDate}
            maxDate={maxDate}
            onClose={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />,
          document.body,
        )}
    </section>
  );
}

function Row({ expense: e, names, me, onEdit }: { expense: Expense; names: Names; me: PersonId | null; onEdit: () => void }) {
  const kind = KIND[e.seccion];
  const owed = owedAmount(e);
  const debtor: PersonId = e.pagadoPor === 1 ? 2 : 1;
  const who = beneficiaryOf(e);
  const payer = e.pagadoPor === me ? "Tú" : names[e.pagadoPor];
  const split =
    who !== "pareja"
      ? who === me
        ? "Solo yo"
        : `Solo ${names[who]}`
      : e.porcentaje1 === 50
        ? "A medias"
        : `Según sueldos (${formatPct(e.porcentaje1)} / ${formatPct(100 - e.porcentaje1)})`;
  const owes = debtor === me ? "Debes" : `${names[debtor]} debe`;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kind.soft} ${kind.ink}`}>
          <kind.Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{e.concepto}</p>
          <p className="truncate text-xs font-medium text-mute">
            {formatDate(e.fecha)} · Pagado por {payer} · {split}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[15px] font-extrabold tabular-nums">{formatEUR(e.importe)}</span>
          {owed > 0 ? (
            <SettleButton
              id={e.id}
              saldado={e.saldado}
              debtor={names[debtor]}
              creditor={names[e.pagadoPor]}
              amount={formatEUR(owed)}
              label={e.saldado ? "Pagado" : `${owes} ${formatEUR(owed)}`}
            />
          ) : (
            <span className="chip chip-none">Sin deuda</span>
          )}
        </div>
        <RowMenu expense={e} onEdit={onEdit} />
      </div>
      {e.productos && e.productos.length > 0 && <Products productos={e.productos} total={e.importe} />}
    </li>
  );
}

function RowMenu({ expense: e, onEdit }: { expense: Expense; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => !ref.current?.contains(ev.target as Node) && setOpen(false);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative -mr-1.5 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Más opciones de ${e.concepto}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-mute transition hover:bg-seg hover:text-ink focus-visible:outline-3 focus-visible:outline-brand"
      >
        <IconDots className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="pop-in absolute top-full right-0 z-30 mt-1 w-44 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-field"
          >
            <IconEdit className="h-[18px] w-[18px] text-ink2" /> Editar
          </button>
          <form ref={formRef} action={deleteExpense}>
            <input type="hidden" name="id" value={e.id} />
            <button
              type="submit"
              role="menuitem"
              onClick={(ev) => {
                if (!confirm(`¿Eliminar el gasto «${e.concepto}»? Esta acción no se puede deshacer.`)) ev.preventDefault();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-danger hover:bg-danger-soft"
            >
              <IconTrash className="h-[18px] w-[18px]" /> Eliminar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Productos de un ticket escaneado, plegados por defecto. */
function Products({ productos, total }: { productos: { nombre: string; importe: number }[]; total: number }) {
  const sum = Math.round(productos.reduce((a, p) => a + p.importe, 0) * 100) / 100;
  return (
    <details className="group mt-2 pl-[52px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-seg px-2.5 py-1 text-xs font-bold text-ink2 hover:bg-line [&::-webkit-details-marker]:hidden">
        <IconReceipt className="h-3.5 w-3.5" />
        {productos.length === 1 ? "1 producto" : `${productos.length} productos`}
        <IconChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <ul className="mt-1.5 space-y-0.5 rounded-xl bg-field px-3 py-2 text-xs">
        {productos.map((p, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-ink2">{p.nombre}</span>
            <span className="shrink-0 font-bold tabular-nums">{formatEUR(p.importe)}</span>
          </li>
        ))}
        {Math.abs(sum - total) >= 0.01 && (
          <li className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-medium text-mute">
            <span>Suma de productos</span>
            <span className="tabular-nums">{formatEUR(sum)}</span>
          </li>
        )}
      </ul>
    </details>
  );
}
