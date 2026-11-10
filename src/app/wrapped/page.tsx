import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { RegenerateWrapped } from "@/components/regenerate-wrapped";
import { formatEUR } from "@/lib/calc";
import { ensureWrapped, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { availableWrappedYear, canBuildWrapped, wrappedStart, wrappedEnd, type WrappedData } from "@/lib/wrapped";

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
            Cada 1 de diciembre os preparamos un resumen de vuestro año, con humor y en formato historias. Se queda
            disponible hasta el 31 de octubre y el 1 de noviembre se borra.
          </p>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-3xl bg-violet-100/70" aria-busy="true" />}>
          <Content />
        </Suspense>
      </main>
    </>
  );
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
};

const daysUntil = (from: string, to: string) => {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((ms(to) - ms(from)) / 86_400_000));
};

async function Content() {
  await connection(); // depende de la fecha de hoy: se calcula en cada visita, no al compilar
  const retention = getRetention();
  await purgeExpired(retention);

  const year = availableWrappedYear(retention.today);
  if (year === null) {
    // Del 1 al 30 de noviembre no hay Wrapped: el anterior ya se borró y el nuevo llega el 1 de diciembre.
    const days = daysUntil(retention.today, `${retention.currentYear}-12-01`);
    return (
      <section className="card p-6 text-center">
        <p className="text-4xl" aria-hidden="true">
          ⏳
        </p>
        <h3 className="font-display mt-1 text-2xl font-semibold text-violet-950">Todavía no está listo</h3>
        <p className="mt-1 text-sm font-bold text-violet-600">
          Se crea el 1 de diciembre · {days === 1 ? "falta 1 día" : `faltan ${days} días`}
        </p>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Contará los gastos desde el 1 de diciembre de {retention.currentYear - 1} hasta el 30 de noviembre.
        </p>
      </section>
    );
  }

  const data = await ensureWrapped(year, retention.today);
  if (!data) {
    return (
      <p className="rounded-3xl bg-white/80 px-6 py-10 text-center text-sm font-semibold text-slate-500">
        🌱 No hay gastos entre el {longDate(wrappedStart(year))} y el {longDate(wrappedEnd(year))}, así que no hay Wrapped
        este año.
      </p>
    );
  }
  return <ReadyCard data={data} canRegenerate={canBuildWrapped(year, retention.today)} />;
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
        {longDate(data.from)} – {longDate(data.to)}
      </p>
      <p className="text-sm font-semibold text-white/90">
        {data.count} gastos · {formatEUR(data.total)}
      </p>
      <p className="mt-2 text-xs font-bold text-white/80">
        Disponible hasta el 31 de octubre de {data.year + 1}; el 1 de noviembre se borra.
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
