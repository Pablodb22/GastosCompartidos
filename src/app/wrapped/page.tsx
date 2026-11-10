import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { RegenerateWrapped } from "@/components/regenerate-wrapped";
import { formatEUR } from "@/lib/calc";
import { computeWrapped, ensureWrapped, listWrappedYears, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { isWrappedUnlocked, wrappedUnlockDate, type WrappedData } from "@/lib/wrapped";

export const metadata: Metadata = { title: "Wrapped · Cuentas en pareja" };

export default function WrappedPage() {
  return (
    <>
      <AppHeader active="wrapped" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 text-center">
          <p className="text-5xl" aria-hidden="true">
            🎁
          </p>
          <h2 className="font-display text-gradient mt-2 text-3xl font-semibold">Vuestro Wrapped</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-violet-900/60">
            Cada 1 de diciembre os preparamos un resumen de vuestro año, con humor y en formato historias. Se guarda para
            siempre: podéis volver a verlo cuando queráis, aunque los gastos antiguos se borren.
          </p>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-3xl bg-violet-100/70" aria-busy="true" />}>
          <Cards />
        </Suspense>
      </main>
    </>
  );
}

const daysUntil = (from: string, to: string) => {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((ms(to) - ms(from)) / 86_400_000));
};

const formatDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
};

async function Cards() {
  await connection(); // depende de la fecha de hoy: se calcula en cada visita, no al compilar
  const retention = getRetention();
  await purgeExpired(retention);
  const saved = await listWrappedYears();
  const years = [...new Set([retention.currentYear, retention.currentYear - 1, ...saved])].sort((a, b) => b - a);

  const cards: React.ReactNode[] = [];
  for (const year of years) {
    if (isWrappedUnlocked(year, retention.today)) {
      const data = await ensureWrapped(year, retention.today);
      if (data) cards.push(<ReadyCard key={year} data={data} canRegenerate={retention.years.includes(year)} />);
    } else {
      // Año en curso, antes del 1 de diciembre: bloqueado, con vista previa si ya hay gastos.
      const preview = await computeWrapped(year, { preview: true, today: retention.today });
      cards.push(
        <LockedCard key={year} year={year} days={daysUntil(retention.today, wrappedUnlockDate(year))} count={preview?.count ?? 0} />,
      );
    }
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-3xl bg-white/80 px-6 py-10 text-center text-sm font-semibold text-slate-500">
        🌱 Todavía no hay gastos para preparar un Wrapped. ¡Empezad a apuntar!
      </p>
    );
  }
  return <div className="space-y-5">{cards}</div>;
}

function ReadyCard({ data, canRegenerate }: { data: WrappedData; canRegenerate: boolean }) {
  return (
    <section
      aria-labelledby={`wrapped-${data.year}`}
      className="relative overflow-hidden rounded-3xl bg-linear-to-br from-violet-700 via-fuchsia-600 to-orange-500 p-6 text-white shadow-lg"
    >
      <span aria-hidden="true" className="absolute -top-3 right-4 text-8xl opacity-20">
        🎁
      </span>
      <h3 id={`wrapped-${data.year}`} className="font-display text-3xl font-semibold">
        Wrapped {data.year}
      </h3>
      <p className="mt-1 text-sm font-semibold text-white/90">
        {formatDay(data.from)} – {formatDay(data.to)} · {data.count} gastos · {formatEUR(data.total)}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={`/wrapped/ver?anio=${data.year}`}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-violet-800 shadow transition hover:-translate-y-0.5"
        >
          ▶️ Ver ahora
        </Link>
        {canRegenerate && <RegenerateWrapped year={data.year} />}
      </div>
    </section>
  );
}

function LockedCard({ year, days, count }: { year: number; days: number; count: number }) {
  return (
    <section aria-labelledby={`wrapped-${year}`} className="card p-6 text-center">
      <p className="text-4xl" aria-hidden="true">
        🔒
      </p>
      <h3 id={`wrapped-${year}`} className="font-display mt-1 text-2xl font-semibold text-violet-950">
        Wrapped {year}
      </h3>
      <p className="mt-1 text-sm font-bold text-violet-600">
        Se desbloquea el 1 de diciembre · {days === 1 ? "falta 1 día" : `faltan ${days} días`}
      </p>
      {count > 0 ? (
        <>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Mientras tanto, podéis echarle un vistazo con los {count} gastos de hoy. El de verdad se prepara el 1 de diciembre.
          </p>
          <Link
            href={`/wrapped/ver?anio=${year}&vista=previa`}
            className="btn-secondary mt-4"
          >
            👀 Vista previa
          </Link>
        </>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500">Todavía no hay gastos este año. ¡A apuntar!</p>
      )}
    </section>
  );
}
