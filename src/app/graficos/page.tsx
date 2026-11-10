import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { PieChart } from "@/components/charts";
import { formatEUR } from "@/lib/calc";
import type { PersonId } from "@/lib/config";
import { getCouple, listExpensesBetween, listMonthsWithData, purgeExpired } from "@/lib/expenses";
import { MonthPicker } from "@/components/month-picker";
import { formatMonth, getRetention, lastDayOfMonth } from "@/lib/periods";
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
  const [all, monthsWithData] = await Promise.all([
    listExpensesBetween(`${month}-01`, lastDayOfMonth(month)),
    listMonthsWithData(),
  ]);
  const monthName = formatMonth(month).split(" ")[0].toLowerCase();

  return (
    <div className="space-y-6">
      <MonthPicker basePath="/graficos" month={month} retention={retention} monthsWithData={monthsWithData} />

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
