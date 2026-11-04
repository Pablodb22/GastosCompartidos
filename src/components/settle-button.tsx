"use client";

import { useFormStatus } from "react-dom";
import { settleAll, toggleSettled } from "@/app/actions";

function Chip({ saldado, title }: { saldado: boolean; title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-extrabold whitespace-nowrap transition hover:-translate-y-0.5 disabled:opacity-60 ${
        saldado
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
          : "border-amber-300 bg-amber-100 text-amber-800 hover:border-amber-400"
      }`}
    >
      {pending ? "…" : saldado ? "✅ Pagado" : "⏳ Pendiente"}
    </button>
  );
}

/**
 * Cambia un gasto entre «pendiente» y «pagado». Pagar solo lo marca: el gasto
 * sigue guardado y visible, pero deja de contar en «¿Quién debe a quién?».
 */
export function SettleButton({
  id,
  saldado,
  debtor,
  creditor,
  amount,
}: {
  id: number;
  saldado: boolean;
  debtor: string;
  creditor: string;
  amount: string;
}) {
  const title = saldado
    ? `${debtor} ya pagó ${amount} a ${creditor}. Pulsa para volver a dejarlo pendiente.`
    : `${debtor} debe ${amount} a ${creditor}. Pulsa cuando lo haya pagado.`;
  return (
    <form action={toggleSettled}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="saldado" value={String(!saldado)} />
      <Chip saldado={saldado} title={title} />
    </form>
  );
}

function SettleAllSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary w-full">
      {pending ? "Guardando…" : "✅ Marcar todo como pagado"}
    </button>
  );
}

export function SettleAllButton({ month, label }: { month: string; label: string }) {
  return (
    <form
      action={settleAll}
      onSubmit={(e) => {
        if (!confirm(`¿Marcar como pagados todos los gastos pendientes de ${label}? Los gastos no se borran.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="mes" value={month} />
      <SettleAllSubmit />
    </form>
  );
}
