import { Suspense } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CoupleForm } from "@/components/couple-form";
import { ExpenseForm } from "@/components/expense-form";
import { DeleteButton } from "@/components/delete-button";
import { ImportButton } from "@/components/import-button";
import { TicketScanner } from "@/components/ticket-scanner";
import { SettleAllButton, SettleButton } from "@/components/settle-button";
import {
  beneficiaryOf,
  formatEUR,
  owedAmount,
  formatPct,
  rentPercent,
  summarize,
  type Expense,
  type MonthSummary,
  type Totals,
} from "@/lib/calc";
import { SECTIONS, type PersonId, type Section } from "@/lib/config";
import { getCouple, listExpenses, purgeExpired, type Couple } from "@/lib/expenses";
import { formatDate, formatMonth, formatShortMonth, getRetention, lastDayOfMonth, type Retention } from "@/lib/periods";

type Names = Record<PersonId, string>;

const SECTION_STYLE: Record<Section, { emoji: string; tile: string; chip: string; amount: string; formBg: string }> = {
  fijos: {
    emoji: "🏠",
    tile: "from-sky-100 to-indigo-100",
    chip: "bg-sky-100",
    amount: "text-indigo-600",
    formBg: "bg-sky-50/70",
  },
  comida: {
    emoji: "🛒",
    tile: "from-lime-100 to-emerald-100",
    chip: "bg-lime-100",
    amount: "text-emerald-600",
    formBg: "bg-lime-50/70",
  },
  ocio: {
    emoji: "🎉",
    tile: "from-amber-100 to-pink-100",
    chip: "bg-amber-100",
    amount: "text-pink-600",
    formBg: "bg-amber-50/70",
  },
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppHeader active="cuentas" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-center text-xs font-semibold text-violet-300 sm:px-6">
        🗓️ Los datos se conservan durante dos meses. El día 15 de cada mes se elimina el mes más antiguo.
      </footer>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { mes } = await searchParams;
  const retention = getRetention();
  const [couple] = await Promise.all([getCouple(), purgeExpired(retention)]);

  if (!couple.configured) return <Onboarding couple={couple} />;

  const month = typeof mes === "string" && retention.months.includes(mes) ? mes : retention.currentMonth;
  const expenses = await listExpenses(month);
  const summary = summarize(expenses);
  const names = couple.names;
  const defaultDate = month === retention.currentMonth ? retention.today : lastDayOfMonth(month);
  const rentPct = rentPercent(couple.salaries);

  return (
    <div className="space-y-6">
      <MonthBar retention={retention} month={month} hasExpenses={expenses.length > 0} names={names} defaultDate={defaultDate} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total del mes" emoji="💸" value={summary.overall.total} count={summary.overall.count} highlight />
        {SECTIONS.map((s) => (
          <Stat
            key={s.id}
            label={s.title}
            emoji={SECTION_STYLE[s.id].emoji}
            tile={SECTION_STYLE[s.id].tile}
            value={summary.bySection[s.id].total}
            count={summary.bySection[s.id].count}
          />
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="space-y-6 lg:order-2">
          <DebtCard summary={summary} names={names} month={month} />
          <CoupleCard couple={couple} rentPct={rentPct} />
        </aside>

        <div className="space-y-6 lg:order-1">
          {SECTIONS.map((s) => (
            <SectionCard
              key={s.id}
              section={s.id}
              title={s.title}
              description={s.description}
              totals={summary.bySection[s.id]}
              expenses={expenses.filter((e) => e.seccion === s.id)}
              names={names}
              rentPct={rentPct}
              form={
                <ExpenseForm
                  section={s.id}
                  names={names}
                  defaultDate={defaultDate}
                  minDate={retention.cutoffDate}
                  maxDate={retention.maxDate}
                />
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Bienvenida ----------

function Onboarding({ couple }: { couple: Couple }) {
  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mb-6 text-center">
        <p className="text-5xl" aria-hidden="true">
          👋💑
        </p>
        <h2 className="font-display text-gradient mt-3 text-3xl font-semibold tracking-tight">¡Hola, parejita!</h2>
        <p className="mt-2 text-sm font-semibold text-violet-900/60">
          Indicad vuestros nombres y sueldos netos mensuales. El alquiler se repartirá en proporción a los sueldos; el
          resto de gastos, a partes iguales.
        </p>
      </div>
      <div className="card p-6">
        <CoupleForm names={couple.names} salaries={couple.salaries} configured={false} />
      </div>
    </div>
  );
}

// ---------- Selector de mes ----------

function MonthBar({
  retention,
  month,
  hasExpenses,
  names,
  defaultDate,
}: {
  retention: Retention;
  month: string;
  hasExpenses: boolean;
  names: Names;
  defaultDate: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Mes" className="inline-flex w-fit gap-1 rounded-full border-2 border-white bg-white/80 p-1 shadow-sm">
          {retention.months.map((m) => {
            const active = m === month;
            return (
              <Link
                key={m}
                href={m === retention.currentMonth ? "/" : `/?mes=${m}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-extrabold capitalize transition ${
                  active
                    ? "bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow-md"
                    : "text-violet-700 hover:bg-violet-100"
                }`}
              >
                {formatShortMonth(m)}
              </Link>
            );
          })}
        </nav>
        <TicketScanner names={names} today={defaultDate} minDate={retention.cutoffDate} maxDate={retention.maxDate} />
        <a
          href={`/api/export?mes=${month}`}
          className="btn-secondary whitespace-nowrap"
          download
          title={hasExpenses ? "Descargar los gastos de este mes" : "Descargar una plantilla vacía para rellenar"}
        >
          📤 {hasExpenses ? "Exportar Excel" : "Plantilla Excel"}
        </a>
        <ImportButton />
      </div>
      <p className="flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
        <span aria-hidden="true">⏳</span>
        {formatMonth(retention.monthToPurge)} se eliminará el {formatDate(retention.nextPurgeDate, "long")}.
      </p>
    </div>
  );
}

function Stat({
  label,
  emoji,
  value,
  count,
  highlight,
  tile = "",
}: {
  label: string;
  emoji: string;
  value: number;
  count: number;
  highlight?: boolean;
  tile?: string;
}) {
  return (
    <div
      className={`hover-wiggle relative overflow-hidden rounded-3xl bg-linear-to-br p-4 shadow-[0_8px_24px_-14px_rgb(124_58_237/0.45)] transition hover:-translate-y-1 sm:p-5 ${
        highlight ? "from-violet-600 via-fuchsia-500 to-orange-400 text-white" : `${tile} text-violet-950`
      }`}
    >
      <span className="wiggle absolute top-3 right-3 text-2xl sm:text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <p className={`truncate pr-8 text-xs font-extrabold ${highlight ? "text-white/85" : "text-violet-950/60"}`}>{label}</p>
      <p className="font-display mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-3xl">{formatEUR(value)}</p>
      <p className={`mt-1 text-xs font-bold ${highlight ? "text-white/80" : "text-violet-950/50"}`}>
        {count === 1 ? "1 gasto" : `${count} gastos`}
      </p>
    </div>
  );
}

// ---------- ¿Quién debe a quién? ----------

function debtText(balance: number, names: Names) {
  if (Math.abs(balance) < 0.005) return null;
  const debtor: PersonId = balance > 0 ? 2 : 1;
  const creditor: PersonId = debtor === 1 ? 2 : 1;
  return { debtor: names[debtor], creditor: names[creditor], amount: Math.abs(balance) };
}

function DebtCard({ summary, names, month }: { summary: MonthSummary; names: Names; month: string }) {
  const debt = debtText(summary.overall.balance, names);
  return (
    <section className="card overflow-hidden" aria-labelledby="deudas">
      <div className="relative bg-linear-to-br from-violet-600 via-fuchsia-500 to-orange-400 px-5 py-6 text-white">
        <span className="absolute top-4 right-5 text-4xl" aria-hidden="true">
          {debt ? "🤝" : "🥳"}
        </span>
        <h2 id="deudas" className="text-sm font-extrabold text-white/85">
          ¿Quién debe a quién?
        </h2>
        {debt ? (
          <>
            <p className="font-display mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formatEUR(debt.amount)}</p>
            <p className="mt-1 text-sm font-semibold text-white/85">
              <span className="font-extrabold text-white">{debt.debtor}</span> debe a{" "}
              <span className="font-extrabold text-white">{debt.creditor}</span>
              <span className="ml-1.5 rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">⏳ pendiente</span>
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-2 text-3xl font-semibold tracking-tight">
              {summary.overall.settled > 0 ? "¡Todo pagado!" : "¡Estáis en paz!"}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/85">No hay importes pendientes en {formatMonth(month).toLowerCase()}.</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-b-2 border-violet-50 p-4">
        {([1, 2] as const).map((p) => (
          <div key={p} className={`rounded-2xl px-4 py-3 ${p === 1 ? "bg-violet-50" : "bg-pink-50"}`}>
            <p className={`truncate text-sm font-extrabold ${p === 1 ? "text-violet-700" : "text-pink-600"}`}>{names[p]}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-slate-500">Ha pagado</dt>
                <dd className="font-bold tabular-nums text-slate-800">{formatEUR(summary.overall.paidBy[p])}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-slate-500">Su parte</dt>
                <dd className="font-bold tabular-nums text-slate-800">{formatEUR(summary.overall.costFor[p])}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <ul className="divide-y-2 divide-violet-50 px-5">
        {SECTIONS.map((s) => {
          const d = debtText(summary.bySection[s.id].balance, names);
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="font-bold text-slate-700">
                <span aria-hidden="true">{SECTION_STYLE[s.id].emoji}</span> {s.title}
              </span>
              {d ? (
                <span className="text-right text-xs font-semibold text-slate-500">
                  {d.debtor} debe <span className="font-extrabold tabular-nums text-fuchsia-600">{formatEUR(d.amount)}</span>
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ En paz</span>
              )}
            </li>
          );
        })}
      </ul>

      {(summary.overall.settled > 0 || summary.overall.pendingCount > 0) && (
        <div className="space-y-3 border-t-2 border-violet-50 px-5 py-4">
          {summary.overall.settled > 0 && (
            <p className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
              <span>✅ Ya pagado este mes</span>
              <span className="font-extrabold tabular-nums text-emerald-600">{formatEUR(summary.overall.settled)}</span>
            </p>
          )}
          {summary.overall.pendingCount > 0 && (
            <SettleAllButton month={month} label={formatMonth(month).toLowerCase()} />
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Datos de la pareja ----------

function CoupleCard({ couple, rentPct }: { couple: Couple; rentPct: number | null }) {
  const { names, salaries } = couple;
  return (
    <section className="card p-5" aria-labelledby="pareja">
      <h2 id="pareja" className="font-display text-lg font-semibold text-violet-950">
        💑 Datos de la pareja
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        {([1, 2] as const).map((p) => (
          <div key={p} className="flex justify-between gap-3">
            <dt className={`truncate font-bold ${p === 1 ? "text-violet-700" : "text-pink-600"}`}>{names[p]}</dt>
            <dd className="font-bold tabular-nums text-slate-800">
              {salaries[p] === null ? "—" : `${formatEUR(salaries[p])}/mes`}
            </dd>
          </div>
        ))}
      </dl>
      {rentPct !== null && (
        <div className="mt-4 rounded-2xl bg-linear-to-r from-violet-50 to-pink-50 p-3">
          <p className="text-xs font-extrabold text-violet-900/70">🏠 Reparto del alquiler según sueldos</p>
          <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-white">
            <div className="rounded-full bg-violet-500" style={{ width: `${rentPct}%` }} />
            <div className="rounded-full bg-pink-400" style={{ width: `${100 - rentPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden="true" />
              {names[1]} {formatPct(rentPct)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-pink-400" aria-hidden="true" />
              {names[2]} {formatPct(100 - rentPct)}
            </span>
          </div>
        </div>
      )}
      <details className="group mt-4">
        <summary className="cursor-pointer list-none text-sm font-extrabold text-fuchsia-600 hover:text-fuchsia-700 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">✏️ Editar nombres y sueldos</span>
          <span className="hidden group-open:inline">Cerrar edición</span>
        </summary>
        <div className="mt-4">
          <CoupleForm names={names} salaries={salaries} configured />
          <p className="mt-3 text-xs text-slate-500">
            Los cambios de sueldo se aplican a los alquileres que registréis a partir de ahora.
          </p>
        </div>
      </details>
    </section>
  );
}

// ---------- Apartados ----------

function SectionCard({
  section,
  title,
  description,
  totals,
  expenses,
  names,
  rentPct,
  form,
}: {
  section: Section;
  title: string;
  description: string;
  totals: Totals;
  expenses: Expense[];
  names: Names;
  rentPct: number | null;
  form: React.ReactNode;
}) {
  const style = SECTION_STYLE[section];
  return (
    <section className="card overflow-hidden" aria-labelledby={`sec-${section}`}>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="hover-wiggle flex min-w-0 items-center gap-3">
          <span
            className={`wiggle flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${style.chip}`}
            aria-hidden="true"
          >
            {style.emoji}
          </span>
          <div className="min-w-0">
            <h2 id={`sec-${section}`} className="font-display text-xl font-semibold text-violet-950">
              {title}
            </h2>
            <p className="text-xs font-semibold text-slate-500">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl font-semibold tabular-nums ${style.amount}`}>{formatEUR(totals.total)}</p>
          <p className="text-xs font-bold text-slate-400">{totals.count === 1 ? "1 gasto" : `${totals.count} gastos`}</p>
        </div>
      </div>

      <div className={`mx-3 rounded-2xl px-4 py-4 ${style.formBg}`}>
        {form}
        {section === "fijos" && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            💡{" "}
            {rentPct === null
              ? "El alquiler se reparte según los sueldos: indícalos en «Datos de la pareja»."
              : `El alquiler se reparte según los sueldos (${names[1]} ${formatPct(rentPct)} · ${names[2]} ${formatPct(100 - rentPct)}). Internet, agua y luz, a partes iguales.`}
          </p>
        )}
        {section === "comida" && <p className="mt-3 text-xs font-semibold text-slate-500">⚖️ Se reparte a partes iguales.</p>}
        {section === "ocio" && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            ⚖️ El ocio en pareja se reparte a partes iguales. El individual corre entero a cargo de quien lo disfruta: si lo
            paga la otra persona, queda como deuda.
          </p>
        )}
      </div>

      {expenses.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm font-semibold text-slate-400">
          <span className="mb-1 block text-3xl" aria-hidden="true">
            🌱
          </span>
          Sin gastos este mes.
        </p>
      ) : (
        <ul className="space-y-1 p-3">
          {expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2.5 transition hover:bg-violet-50/70">
              <span className="w-14 shrink-0 rounded-full bg-violet-50 py-1 text-center text-xs font-bold text-violet-600">
                {formatDate(e.fecha)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{e.concepto}</p>
                <p className="truncate text-xs font-semibold text-slate-500">
                  Pagado por{" "}
                  <span className={e.pagadoPor === 1 ? "text-violet-600" : "text-pink-600"}>{names[e.pagadoPor]}</span> ·{" "}
                  <SplitText expense={e} names={names} />
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="whitespace-nowrap text-sm font-extrabold tabular-nums text-slate-800">{formatEUR(e.importe)}</span>
                <SettleChip expense={e} names={names} />
              </div>
              <DeleteButton id={e.id} label={e.concepto} />
              {/* Ocupa toda la fila para que los nombres de los productos se lean bien en el móvil. */}
              {e.productos && <ProductList productos={e.productos} total={e.importe} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Productos de un ticket escaneado, plegados por defecto. */
function ProductList({ productos, total }: { productos: { nombre: string; importe: number }[]; total: number }) {
  const sum = Math.round(productos.reduce((a, p) => a + p.importe, 0) * 100) / 100;
  return (
    <details className="group basis-full pl-17">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-600 hover:bg-violet-100 [&::-webkit-details-marker]:hidden">
        🧾 {productos.length === 1 ? "1 producto" : `${productos.length} productos`}
        <span aria-hidden="true" className="transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="mt-1.5 space-y-0.5 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        {productos.map((p, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-slate-600">{p.nombre}</span>
            <span className="shrink-0 font-bold text-slate-800 tabular-nums">{formatEUR(p.importe)}</span>
          </li>
        ))}
        {Math.abs(sum - total) >= 0.01 && (
          <li className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold text-slate-500">
            <span>Suma de productos</span>
            <span className="tabular-nums">{formatEUR(sum)}</span>
          </li>
        )}
      </ul>
    </details>
  );
}

/** Botón pendiente/pagado. Solo aparece si el gasto genera deuda para la otra persona. */
function SettleChip({ expense, names }: { expense: Expense; names: Names }) {
  const amount = owedAmount(expense);
  if (amount <= 0) return null;
  const creditor = expense.pagadoPor;
  const debtor: PersonId = creditor === 1 ? 2 : 1;
  return (
    <SettleButton
      id={expense.id}
      saldado={expense.saldado}
      debtor={names[debtor]}
      creditor={names[creditor]}
      amount={formatEUR(amount)}
    />
  );
}

function SplitText({ expense, names }: { expense: Expense; names: Names }) {
  const who = beneficiaryOf(expense);
  if (who !== "pareja") {
    return (
      <span className={`rounded-full px-1.5 py-0.5 ${who === 1 ? "bg-violet-100 text-violet-700" : "bg-pink-100 text-pink-700"}`}>
        🙋 Solo {names[who]}
      </span>
    );
  }
  if (expense.porcentaje1 === 50) return <>{expense.seccion === "ocio" ? "💑 En pareja" : "50/50"}</>;
  const share1 = (expense.importe * expense.porcentaje1) / 100;
  return (
    <span title={`${names[1]} ${formatPct(expense.porcentaje1)} · ${names[2]} ${formatPct(100 - expense.porcentaje1)}`}>
      Según sueldos: {names[1]} {formatEUR(share1)} · {names[2]} {formatEUR(expense.importe - share1)}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="h-10 w-72 rounded-full bg-violet-100/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-3xl bg-violet-100/70" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="h-96 rounded-3xl bg-violet-100/70" />
        <div className="h-96 rounded-3xl bg-violet-100/70" />
      </div>
    </div>
  );
}
