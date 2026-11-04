import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import {
  CumulativeLine,
  Delta,
  Legend,
  RankedBars,
  SplitBar,
  StackedColumns,
  StatTile,
} from "@/components/charts";
import { formatEUR } from "@/lib/calc";
import type { PersonId } from "@/lib/config";
import { getCouple, listExpensesBetween, purgeExpired } from "@/lib/expenses";
import { formatDate, formatMonth, formatShortMonth, getRetention, shiftMonth } from "@/lib/periods";
import { CATEGORIES, coupleStats, personStats, type CoupleStats, type PersonStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Gráficos · Cuentas en pareja" };

type Names = Record<PersonId, string>;

// Colores de los gráficos (validados para daltonismo y contraste).
const PERSON_COLOR: Record<PersonId, string> = { 1: "#7c3aed", 2: "#db2777" };
const SECTION_SERIES = [
  { key: "fijos", label: "Gastos fijos", color: "#2a78d6" },
  { key: "comida", label: "Comida", color: "#1baf7a" },
  { key: "ocio", label: "Ocio en pareja", color: "#eb6834" },
];

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
  const all = await listExpensesBetween(retention.cutoffDate, retention.maxDate);

  const prevMonth = shiftMonth(month, -1);
  const prevAvailable = retention.months.includes(prevMonth);
  const opts = { today: retention.today, prevAvailable };
  const people = ([1, 2] as const).map((p) => personStats(all, month, p, opts));
  const pair = coupleStats(all, retention.months, month, retention.today);
  const labels = { month: formatMonth(month).split(" ")[0].toLowerCase(), prev: formatMonth(prevMonth).split(" ")[0].toLowerCase() };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="text-xs font-semibold text-slate-500">
          📊 Cada persona ve <strong>su parte</strong> de los gastos (lo que le toca tras el reparto), no lo que ha adelantado.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        {people.map((s) => (
          <PersonCard key={s.person} stats={s} names={couple.names} labels={labels} />
        ))}
      </div>

      <CoupleCard stats={pair} names={couple.names} labels={labels} />
    </div>
  );
}

// ---------- Tarjeta individual ----------

function PersonCard({ stats: s, names, labels }: { stats: PersonStats; names: Names; labels: { month: string; prev: string } }) {
  const p = s.person;
  const other: PersonId = p === 1 ? 2 : 1;
  const color = PERSON_COLOR[p];
  const prevAvailable = s.prevTotal !== null;
  const biggest = s.categories.find((c) => c.amount > 0);

  return (
    <section className="card p-5" aria-labelledby={`persona-${p}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
          style={{ background: color }}
        >
          {names[p].slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 id={`persona-${p}`} className="font-display truncate text-2xl font-semibold text-violet-950">
            {names[p]}
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Su parte de los gastos de {labels.month}
            {biggest && (
              <>
                {" "}
                · lo que más pesa: {CATEGORIES[biggest.key].emoji} {CATEGORIES[biggest.key].label.toLowerCase()}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatTile
          label="Su gasto"
          value={formatEUR(s.total)}
          sub={
            s.prevSameDay !== null ? (
              <Delta now={s.total} prev={s.prevSameDay} prevLabel={`${labels.prev} a día ${s.elapsed}`} />
            ) : (
              <Delta now={s.total} prev={s.prevTotal} prevLabel={labels.prev} />
            )
          }
        />
        <StatTile
          label="Ha pagado de su bolsillo"
          value={formatEUR(s.paid)}
          sub={
            <span className="text-slate-500">
              {s.paidCount === 1 ? "1 gasto pagado" : `${s.paidCount} gastos pagados`} · participa en {s.count}
            </span>
          }
        />
        <StatTile
          label={s.pending > 0.004 ? `${names[other]} le debe` : s.pending < -0.004 ? `Debe a ${names[other]}` : "Pendiente"}
          value={formatEUR(Math.abs(s.pending))}
          sub={
            <span className={Math.abs(s.pending) < 0.005 ? "text-[#006300]" : "text-slate-500"}>
              {Math.abs(s.pending) < 0.005 ? "✓ Todo al día" : "⏳ Sin pagar todavía"}
            </span>
          }
        />
        <StatTile
          label="Media al día"
          value={formatEUR(s.dailyAvg)}
          sub={<span className="text-slate-500">Su parte ÷ días del mes</span>}
        />
      </div>

      <h3 className="mt-6 mb-3 text-sm font-extrabold text-slate-800">¿En qué se le va el dinero?</h3>
      {s.categories.length === 0 ? (
        <Empty />
      ) : (
        <>
          <RankedBars
            color={color}
            prevLabel={labels.prev}
            data={s.categories.map((c) => ({
              key: c.key,
              label: CATEGORIES[c.key].label,
              emoji: CATEGORIES[c.key].emoji,
              value: c.amount,
              pct: c.pct,
              count: c.count,
              prev: c.prev,
            }))}
          />
          {prevAvailable && (
            <div className="mt-3">
              <Legend
                items={[
                  { label: labels.month, color },
                  { label: `${labels.prev} (mes completo)`, color: "#c3c2b7" },
                ]}
              />
            </div>
          )}
        </>
      )}

      <h3 className="mt-6 mb-2 text-sm font-extrabold text-slate-800">Así ha ido creciendo su gasto</h3>
      {s.cumulative.length === 0 ? (
        <Empty />
      ) : (
        <>
          <CumulativeLine
            current={s.cumulative}
            previous={s.prevCumulative}
            days={s.daysInMonth}
            color={color}
            currentLabel={labels.month}
            prevLabel={labels.prev}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Legend
              items={[
                { label: `${labels.month} (día a día)`, color, kind: "line" },
                ...(s.prevCumulative ? [{ label: labels.prev, color: "#b4b2a9", kind: "line" as const }] : []),
              ]}
            />
            <span className="text-[11px] font-semibold text-slate-400">Pasa el dedo por el gráfico</span>
          </div>
        </>
      )}

      <h3 className="mt-6 mb-2 text-sm font-extrabold text-slate-800">Sus gastos más grandes</h3>
      {s.top.length === 0 ? (
        <Empty />
      ) : (
        <ol className="space-y-1.5">
          {s.top.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-slate-50/80 px-3 py-2">
              <span className="w-5 text-center text-sm font-extrabold text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{t.concepto}</p>
                <p className="truncate text-xs font-semibold text-slate-500">
                  {formatDate(t.fecha)} · {t.individual ? "solo suyo" : `su parte de ${formatEUR(t.importe)}`} · pagó{" "}
                  {names[t.pagadoPor]}
                </p>
              </div>
              <span className="text-sm font-extrabold text-slate-900 tabular-nums">{formatEUR(t.share)}</span>
            </li>
          ))}
        </ol>
      )}

      {s.categories.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-bold text-violet-500">Ver los datos en tabla</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 font-bold">Categoría</th>
                <th className="py-1 text-right font-bold capitalize">{labels.month}</th>
                {prevAvailable && <th className="py-1 text-right font-bold capitalize">{labels.prev}</th>}
                <th className="py-1 text-right font-bold">Gastos</th>
                <th className="py-1 text-right font-bold">%</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-800">
              {s.categories.map((c) => (
                <tr key={c.key} className="border-t border-slate-100">
                  <td className="py-1">{CATEGORIES[c.key].label}</td>
                  <td className="py-1 text-right font-bold">{formatEUR(c.amount)}</td>
                  {prevAvailable && <td className="py-1 text-right">{formatEUR(c.prev ?? 0)}</td>}
                  <td className="py-1 text-right">{c.count}</td>
                  <td className="py-1 text-right">{Math.round(c.pct)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

// ---------- Tarjeta de pareja ----------

function CoupleCard({ stats: s, names, labels }: { stats: CoupleStats; names: Names; labels: { month: string; prev: string } }) {
  const top = SECTION_SERIES.map((x) => ({ ...x, v: s.current[x.key as "fijos"] })).sort((a, b) => b.v - a.v)[0];
  return (
    <section className="card p-5" aria-labelledby="pareja-graficos">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-2xl">
          💑
        </span>
        <div>
          <h2 id="pareja-graficos" className="font-display text-2xl font-semibold text-violet-950">
            En pareja
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Gastos comunes: fijos, comida y ocio en pareja (el ocio individual no cuenta aquí)
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile
          label={`Gasto común de ${labels.month}`}
          value={formatEUR(s.current.total)}
          sub={
            s.prevSameDay !== null ? (
              <Delta now={s.current.total} prev={s.prevSameDay} prevLabel={`${labels.prev} a día ${s.elapsed}`} />
            ) : (
              <Delta now={s.current.total} prev={s.prev?.total ?? null} prevLabel={labels.prev} />
            )
          }
        />
        <StatTile label="Media al día" value={formatEUR(s.dailyAvg)} sub={<span className="text-slate-500">{s.count} gastos comunes</span>} />
        <StatTile
          label="Por cabeza (si fuera a medias)"
          value={formatEUR(s.current.total / 2)}
          sub={<span className="text-slate-500">El alquiler va según sueldos</span>}
        />
        <StatTile
          label="Lo que más pesa"
          value={top.v > 0 ? top.label : "—"}
          sub={top.v > 0 ? <span className="text-slate-500">{Math.round((top.v / s.current.total) * 100)} % del gasto común</span> : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h3 className="mb-3 text-sm font-extrabold text-slate-800">Gasto común por mes</h3>
          <StackedColumns
            series={SECTION_SERIES}
            columns={s.months.map((m) => ({
              key: m.month,
              label: formatShortMonth(m.month),
              values: { fijos: m.fijos, comida: m.comida, ocio: m.ocio },
              total: m.total,
              active: m.month === s.current.month,
            }))}
          />
          <div className="mt-3">
            <Legend items={SECTION_SERIES} />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-extrabold text-slate-800">¿Quién ha adelantado lo común en {labels.month}?</h3>
            <SplitBar
              parts={([1, 2] as const).map((p) => ({ label: names[p], value: s.paidBy[p], color: PERSON_COLOR[p] }))}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-extrabold text-slate-800">Desglose de {labels.month}</h3>
            <ul className="space-y-1.5 text-sm">
              {SECTION_SERIES.map((x) => {
                const v = s.current[x.key as "fijos"];
                const prev = s.prev ? s.prev[x.key as "fijos"] : null;
                return (
                  <li key={x.key} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-2">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: x.color }} />
                      {x.label}
                    </span>
                    <span className="text-right">
                      <span className="block font-extrabold text-slate-900 tabular-nums">{formatEUR(v)}</span>
                      <span className="block text-[11px] font-semibold">
                        <Delta
                          now={v}
                          prev={prev}
                          prevLabel={s.prevSameDay !== null ? `${labels.prev} completo` : labels.prev}
                        />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-bold text-violet-500">Ver los datos en tabla</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-bold">Mes</th>
              {SECTION_SERIES.map((x) => (
                <th key={x.key} className="py-1 text-right font-bold">
                  {x.label}
                </th>
              ))}
              <th className="py-1 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-slate-800">
            {s.months.map((m) => (
              <tr key={m.month} className="border-t border-slate-100">
                <td className="py-1 capitalize">{formatMonth(m.month)}</td>
                <td className="py-1 text-right">{formatEUR(m.fijos)}</td>
                <td className="py-1 text-right">{formatEUR(m.comida)}</td>
                <td className="py-1 text-right">{formatEUR(m.ocio)}</td>
                <td className="py-1 text-right font-bold">{formatEUR(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Empty() {
  return <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-400">🌱 Sin gastos este mes.</p>;
}
