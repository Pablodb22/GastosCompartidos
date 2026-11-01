import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { CoupleForm } from "@/components/couple-form";
import { ExpenseForm } from "@/components/expense-form";
import { DeleteButton } from "@/components/delete-button";
import { formatEUR, formatPct, rentPercent, summarize, type Expense, type MonthSummary, type Totals } from "@/lib/calc";
import { SECTIONS, type PersonId, type Section } from "@/lib/config";
import { getCouple, listExpenses, purgeExpired, type Couple } from "@/lib/expenses";
import { formatDate, formatMonth, formatShortMonth, getRetention, lastDayOfMonth, type Retention } from "@/lib/periods";

type Names = Record<PersonId, string>;

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900">Cuentas en pareja</h1>
            <p className="text-xs text-slate-500">Gastos compartidos del hogar</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-slate-400 sm:px-6">
        Los datos se conservan durante dos meses. El día 15 de cada mes se elimina el mes más antiguo.
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
      <MonthBar retention={retention} month={month} hasExpenses={expenses.length > 0} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total del mes" value={summary.overall.total} count={summary.overall.count} highlight />
        {SECTIONS.map((s) => (
          <Stat key={s.id} label={s.title} value={summary.bySection[s.id].total} count={summary.bySection[s.id].count} />
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
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Configurad vuestra cuenta</h2>
        <p className="mt-2 text-sm text-slate-500">
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

function MonthBar({ retention, month, hasExpenses }: { retention: Retention; month: string; hasExpenses: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Mes" className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
          {retention.months.map((m) => {
            const active = m === month;
            return (
              <Link
                key={m}
                href={m === retention.currentMonth ? "/" : `/?mes=${m}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-brand-700 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {formatShortMonth(m)}
              </Link>
            );
          })}
        </nav>
        {hasExpenses && (
          <a href={`/api/export?mes=${month}`} className="btn-secondary whitespace-nowrap" download>
            Exportar CSV
          </a>
        )}
      </div>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        {formatMonth(retention.monthToPurge)} se eliminará el {formatDate(retention.nextPurgeDate, "long")}.
      </p>
    </div>
  );
}

function Stat({ label, value, count, highlight }: { label: string; value: number; count: number; highlight?: boolean }) {
  return (
    <div className={`card p-4 sm:p-5 ${highlight ? "border-brand-100 bg-brand-50/60" : ""}`}>
      <p className={`truncate text-xs font-medium uppercase tracking-wide ${highlight ? "text-brand-700" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{formatEUR(value)}</p>
      <p className="mt-1 text-xs text-slate-500">{count === 1 ? "1 gasto" : `${count} gastos`}</p>
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
      <div className="bg-brand-900 px-5 py-5 text-white">
        <h2 id="deudas" className="text-xs font-medium uppercase tracking-wide text-brand-100">
          ¿Quién debe a quién?
        </h2>
        {debt ? (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatEUR(debt.amount)}</p>
            <p className="mt-1 text-sm text-brand-100">
              <span className="font-medium text-white">{debt.debtor}</span> debe a{" "}
              <span className="font-medium text-white">{debt.creditor}</span>
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight">Estáis en paz</p>
            <p className="mt-1 text-sm text-brand-100">No hay importes pendientes en {formatMonth(month).toLowerCase()}.</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
        {([1, 2] as const).map((p) => (
          <div key={p} className="px-5 py-4">
            <p className="truncate text-sm font-medium text-slate-900">{names[p]}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Ha pagado</dt>
                <dd className="tabular-nums text-slate-900">{formatEUR(summary.overall.paidBy[p])}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Su parte</dt>
                <dd className="tabular-nums text-slate-900">{formatEUR(summary.overall.costFor[p])}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <ul className="divide-y divide-slate-100 px-5">
        {SECTIONS.map((s) => {
          const d = debtText(summary.bySection[s.id].balance, names);
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="text-slate-700">{s.title}</span>
              {d ? (
                <span className="text-right text-xs text-slate-500">
                  {d.debtor} debe <span className="font-medium tabular-nums text-slate-900">{formatEUR(d.amount)}</span>
                </span>
              ) : (
                <span className="text-xs text-slate-400">Sin saldo</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Datos de la pareja ----------

function CoupleCard({ couple, rentPct }: { couple: Couple; rentPct: number | null }) {
  const { names, salaries } = couple;
  return (
    <section className="card p-5" aria-labelledby="pareja">
      <h2 id="pareja" className="text-sm font-semibold text-slate-900">
        Datos de la pareja
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        {([1, 2] as const).map((p) => (
          <div key={p} className="flex justify-between gap-3">
            <dt className="truncate text-slate-600">{names[p]}</dt>
            <dd className="tabular-nums text-slate-900">
              {salaries[p] === null ? "—" : `${formatEUR(salaries[p])}/mes`}
            </dd>
          </div>
        ))}
      </dl>
      {rentPct !== null && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">Reparto del alquiler según sueldos</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="bg-brand-600" style={{ width: `${rentPct}%` }} />
            <div className="bg-sky-400" style={{ width: `${100 - rentPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-600" aria-hidden="true" />
              {names[1]} {formatPct(rentPct)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" />
              {names[2]} {formatPct(100 - rentPct)}
            </span>
          </div>
        </div>
      )}
      <details className="group mt-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-brand-600 hover:text-brand-700 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Editar nombres y sueldos</span>
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
  return (
    <section className="card" aria-labelledby={`sec-${section}`}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id={`sec-${section}`} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatEUR(totals.total)}</p>
          <p className="text-xs text-slate-500">{totals.count === 1 ? "1 gasto" : `${totals.count} gastos`}</p>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        {form}
        {section === "fijos" && (
          <p className="mt-3 text-xs text-slate-500">
            {rentPct === null
              ? "El alquiler se reparte según los sueldos: indícalos en «Datos de la pareja»."
              : `El alquiler se reparte según los sueldos (${names[1]} ${formatPct(rentPct)} · ${names[2]} ${formatPct(100 - rentPct)}). Internet, agua y luz, a partes iguales.`}
          </p>
        )}
        {section !== "fijos" && <p className="mt-3 text-xs text-slate-500">Se reparte a partes iguales.</p>}
      </div>

      {expenses.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Sin gastos este mes.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-14 shrink-0 text-xs text-slate-500">{formatDate(e.fecha)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{e.concepto}</p>
                <p className="truncate text-xs text-slate-500">
                  Pagado por {names[e.pagadoPor]} · <SplitText expense={e} names={names} />
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-medium tabular-nums text-slate-900">{formatEUR(e.importe)}</span>
              <DeleteButton id={e.id} label={e.concepto} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SplitText({ expense, names }: { expense: Expense; names: Names }) {
  if (expense.porcentaje1 === 50) return <>50/50</>;
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
      <div className="h-10 w-72 rounded-lg bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="h-96 rounded-xl bg-slate-200/70" />
        <div className="h-96 rounded-xl bg-slate-200/70" />
      </div>
    </div>
  );
}
