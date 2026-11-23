"use client";

import { useFormStatus } from "react-dom";
import { settleAll, toggleSettled } from "@/app/actions";

function Chip({ saldado, title, label }: { saldado: boolean; title: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={title}
      className={`chip transition hover:brightness-95 disabled:opacity-60 ${saldado ? "chip-ok" : "chip-pend"}`}
    >
      {pending ? "…" : label}
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
  label,
}: {
  id: number;
  saldado: boolean;
  debtor: string;
  creditor: string;
  amount: string;
  label: string;
}) {
  const title = saldado
    ? `${debtor} ya pagó ${amount} a ${creditor}. Pulsa para volver a dejarlo pendiente.`
    : `${debtor} debe ${amount} a ${creditor}. Pulsa cuando lo haya pagado.`;
  return (
    <form action={toggleSettled}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="saldado" value={String(!saldado)} />
      <Chip saldado={saldado} title={title} label={label} />
    </form>
  );
}

function SettleAllSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-[14px] bg-white/95 px-4 py-3 text-[15px] font-extrabold text-brand-deep transition hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60">
      {pending ? "Guardando…" : "Marcar todo como pagado"}
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
