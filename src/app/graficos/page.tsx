import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { PieChart } from "@/components/charts";
import { formatEUR } from "@/lib/calc";
import type { PersonId } from "@/lib/config";
import { getCouple, listExpensesBetween, purgeExpired } from "@/lib/expenses";
import { formatMonth, formatShortMonth, getRetention } from "@/lib/periods";
import { pieFor, type PieData } from "@/lib/stats";

export const metadata: Metadata = { title: "Gráficos · Cuentas en pareja" };

const PERSON_COLOR: Record<PersonId, string> = { 1: "#7c3aed", 2: "#db2777" };

export default function ChartsPage({ searchParams }: PageProps<"/graficos">) {
  return (
    <>
      <AppHeader active="graficos" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-violet-100/70" aria-busy="true" />}>
          <Charts searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Charts({ searchParams }: { searchParams: PageProps<"/graficos">["searchParams"] }) {
  const { mes } = await searchParams;
  const retention = getRetention();
  const [couple] = await Promise.all([getCouple(), purgeExpired(retention)]);
  const month = typeof mes === "string" && retention.months.includes(mes) ? mes : retention.currentMonth;
  const all = await listExpensesBetween(`${month}-01`, retention.maxDate);
  const monthName = formatMonth(month).split(" ")[0].toLowerCase();

  return (
    <div className="space-y-6">
      <nav aria-label="Mes" className="inline-flex w-fit gap-1 rounded-full border-2 border-white bg-white/80 p-1 shadow-sm">
        {retention.months.map((m) => (
          <Link
            key={m}
            href={m === retention.currentMonth ? "/graficos" : `/graficos?mes=${m}`}
            aria-current={m === month ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-extrabold capitalize transition ${
              m === month ? "bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow-md" : "text-violet-700 hover:bg-violet-100"
            }`}
          >
            {formatShortMonth(m)}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {([1, 2] as const).map((p) => (
          <ChartCard
            key={p}
            id={`persona-${p}`}
            badge={
              <span
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
                style={{ background: PERSON_COLOR[p] }}
              >
                {couple.names[p].slice(0, 1).toUpperCase()}
              </span>
            }
            title={couple.names[p]}
            caption={`Su parte de los gastos de ${monthName}`}
            data={pieFor(all, month, p)}
          />
        ))}
        <ChartCard
          id="pareja"
          badge={<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-xl">💑</span>}
          title="En pareja"
          caption={`Gastos comunes de ${monthName}`}
          data={pieFor(all, month, "pareja")}
        />
      </div>
    </div>
  );
}

function ChartCard({
  id,
  badge,
  title,
  caption,
  data,
}: {
  id: string;
  badge: React.ReactNode;
  title: string;
  caption: string;
  data: PieData;
}) {
  return (
    <section className="card p-5" aria-labelledby={id}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true">{badge}</span>
        <div className="min-w-0">
          <h2 id={id} className="font-display truncate text-xl font-semibold text-violet-950">
            {title}
          </h2>
          <p className="text-xs font-semibold text-slate-500">{caption}</p>
        </div>
      </div>
      <p className="font-display mt-3 text-4xl font-semibold text-slate-900">{formatEUR(data.total)}</p>
      <div className="mt-3">
        <PieChart slices={data.slices} total={data.total} ocioTotal={data.ocioTotal} title={`${title}: ${caption}`} />
      </div>
    </section>
  );
}
