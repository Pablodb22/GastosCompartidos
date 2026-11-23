import { Suspense } from "react";
import { AddExpense } from "@/components/add-expense";
import { AppHeader } from "@/components/app-header";
import { CoupleForm } from "@/components/couple-form";
import { HeaderActions } from "@/components/header-actions";
import { IconDownload, IconInfo } from "@/components/icons";
import { ImportButton } from "@/components/import-button";
import { MonthNav } from "@/components/month-nav";
import { Movements } from "@/components/movements";
import { SettleAllButton } from "@/components/settle-button";
import { TicketScanner } from "@/components/ticket-scanner";
import { WrappedBanner } from "@/components/wrapped-banner";
import { formatEUR, formatPct, rentPercent, summarize, type MonthSummary } from "@/lib/calc";
import { SECTIONS, type PersonId } from "@/lib/config";
import { ensureWrapped, getCouple, listExpenses, listMonthsWithData, purgeExpired, type Couple } from "@/lib/expenses";
import { getMe } from "@/lib/me";
import { formatDate, formatMonth, getRetention, lastDayOfMonth, shiftMonth } from "@/lib/periods";
import { availableWrappedYear } from "@/lib/wrapped";
import { KIND } from "@/components/icons";

type Names = Record<PersonId, string>;

const BAR: Record<"fijos" | "comida" | "ocio", string> = { fijos: "bg-fijos", comida: "bg-comida", ocio: "bg-ocio" };

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppHeader
        active="cuentas"
        actions={
          <Suspense>
            <HeaderActions />
          </Suspense>
        }
      />

      <main className="pb-nav mx-auto w-full max-w-6xl flex-1 px-4 pt-4 sm:px-6 sm:pt-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { mes } = await searchParams;
  const retention = getRetention();
  const [couple, me] = await Promise.all([getCouple(), getMe(), purgeExpired(retention)]);

  if (!couple.configured) return <Onboarding couple={couple} />;

  const month = typeof mes === "string" && retention.months.includes(mes) ? mes : retention.currentMonth;
  const firstMonth = retention.months[0];
  const prevMonth = shiftMonth(month, -1);
  const [expenses, monthsWithData, prevExpenses] = await Promise.all([
    listExpenses(month),
    listMonthsWithData(),
    prevMonth >= firstMonth ? listExpenses(prevMonth) : Promise.resolve([]),
  ]);
  // En diciembre, aviso en la portada del Wrapped que se acaba de crear.
  const wrappedYear = availableWrappedYear(retention.today);
  const wrappedReady =
    wrappedYear !== null &&
    retention.today < `${wrappedYear + 1}-01-01` &&
    (await ensureWrapped(wrappedYear, retention.today)) !== null;
  const summary = summarize(expenses);
  const prevTotal = prevExpenses.reduce((a, e) => a + e.importe, 0);
  const names = couple.names;
  const defaultDate = month === retention.currentMonth ? retention.today : lastDayOfMonth(month);
  const rentPct = rentPercent(couple.salaries);

  return (
    <div className="space-y-4">
      {wrappedReady && wrappedYear !== null && <WrappedBanner year={wrappedYear} />}

      <div className="flex items-center justify-between gap-3">
        <MonthNav
          basePath="/"
          month={month}
          currentMonth={retention.currentMonth}
          firstMonth={firstMonth}
          monthsWithData={monthsWithData}
        />
        <AddExpense
          names={names}
          me={me}
          defaultDate={defaultDate}
          minDate={retention.cutoffDate}
          maxDate={retention.maxDate}
          rentPct={rentPct}
        />
      </div>

      <TicketScanner names={names} me={me} today={defaultDate} minDate={retention.cutoffDate} maxDate={retention.maxDate} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_auto_1fr] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <DebtHero summary={summary} names={names} me={me} month={month} />
        </div>
        <div className="lg:col-start-2 lg:row-start-2">
          <MonthCard summary={summary} month={month} prevMonth={prevMonth} prevTotal={prevMonth >= firstMonth ? prevTotal : null} />
        </div>
        <div className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <Movements expenses={expenses} names={names} me={me} minDate={retention.cutoffDate} maxDate={retention.maxDate} />
        </div>
        <div className="lg:col-start-2 lg:row-start-3">
          <SettingsCard couple={couple} rentPct={rentPct} month={month} hasExpenses={expenses.length > 0} yearToPurge={retention.yearToPurge} purgeDate={retention.nextPurgeDate} />
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
        <h2 className="text-3xl font-extrabold tracking-tight">Cuentas en pareja</h2>
        <p className="mt-2 text-sm font-medium text-ink2">
          Indicad vuestros nombres y sueldos netos mensuales. El alquiler se repartirá en proporción a los sueldos; el resto de
          gastos, a partes iguales.
        </p>
      </div>
      <div className="card p-5">
        <CoupleForm names={couple.names} salaries={couple.salaries} configured={false} />
      </div>
    </div>
  );
}

// ---------- ¿Quién debe a quién? ----------

function DebtHero({ summary, names, me, month }: { summary: MonthSummary; names: Names; me: PersonId | null; month: string }) {
  const { balance, settled, pendingCount } = summary.overall;
  const debtor: PersonId = balance > 0 ? 2 : 1;
  const creditor: PersonId = debtor === 1 ? 2 : 1;
  const owes = Math.abs(balance) >= 0.005;

  let headline: string;
  if (!owes) headline = settled > 0 ? "Todo pagado" : "Estáis en paz";
  else if (me === debtor) headline = `Debes a ${names[creditor]}`;
  else if (me === creditor) headline = `${names[debtor]} te debe`;
  else headline = `${names[debtor]} debe a ${names[creditor]}`;

  return (
    <section aria-labelledby="deuda" className="rounded-[20px] bg-linear-to-br from-brand to-brand-deep p-5 text-white shadow-[0_12px_28px_-12px_rgb(91_63_208/0.6)]">
      <h2 id="deuda" className="text-[13px] font-bold text-white/80">
        {headline}
      </h2>
      {owes ? (
        <>
          <p className="mt-1.5 text-[40px] leading-none font-extrabold tracking-tight tabular-nums">{formatEUR(Math.abs(balance))}</p>
          <p className="mt-2 text-[13px] font-medium text-white/80">Pendiente de {formatMonth(month).toLowerCase()}</p>
        </>
      ) : (
        <p className="mt-1.5 text-[15px] font-medium text-white/85">
          No hay importes pendientes en {formatMonth(month).toLowerCase()}. Ni un céntimo en el aire.
        </p>
      )}
      {settled > 0 && (
        <p className="mt-3 flex items-center justify-between border-t border-white/20 pt-3 text-[13px] font-medium text-white/85">
          <span>Ya pagado este mes</span>
          <span className="font-extrabold tabular-nums">{formatEUR(settled)}</span>
        </p>
      )}
      {pendingCount > 0 && (
        <div className="mt-4">
          <SettleAllButton month={month} label={formatMonth(month).toLowerCase()} />
        </div>
      )}
    </section>
  );
}

// ---------- Gasto del mes ----------

function MonthCard({
  summary,
  month,
  prevMonth,
  prevTotal,
}: {
  summary: MonthSummary;
  month: string;
  prevMonth: string;
  prevTotal: number | null;
}) {
  const total = summary.overall.total;
  let delta: string | null = null;
  if (prevTotal !== null && prevTotal >= 50 && total > 0 && Math.abs(total - prevTotal) / prevTotal < 5) {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
    const m = formatMonth(prevMonth).split(" ")[0].toLowerCase();
    delta = pct === 0 ? `Igual que en ${m}` : `${Math.abs(pct)} % ${pct > 0 ? "más" : "menos"} que en ${m}`;
  }
  return (
    <section aria-labelledby="mes" className="card p-5">
      <h2 id="mes" className="text-[13px] font-bold text-mute">
        Gasto de {formatMonth(month).toLowerCase()}
      </h2>
      <p className="mt-1 text-[32px] leading-tight font-extrabold tracking-tight tabular-nums">{formatEUR(total)}</p>
      {delta && <p className="text-[13px] font-semibold text-ink2">{delta}</p>}

      {total > 0 && (
        <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-seg" role="img" aria-label="Reparto del gasto por tipo">
          {SECTIONS.map((s) => {
            const v = summary.bySection[s.id].total;
            return v > 0 ? <div key={s.id} className={`${BAR[s.id]} rounded-full`} style={{ width: `${(v / total) * 100}%` }} /> : null;
          })}
        </div>
      )}
      <ul className="mt-3 space-y-1.5">
        {SECTIONS.map((s) => {
          const t = summary.bySection[s.id];
          return (
            <li key={s.id} className="flex items-center gap-2.5 text-sm">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${BAR[s.id]}`} aria-hidden="true" />
              <span className="flex-1 font-semibold">{KIND[s.id].label === "Fijos" ? "Gastos fijos" : KIND[s.id].label === "Compra" ? "Compra" : "Ocio"}</span>
              <span className="font-extrabold tabular-nums">{formatEUR(t.total)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Ajustes ----------

function SettingsCard({
  couple,
  rentPct,
  month,
  hasExpenses,
  yearToPurge,
  purgeDate,
}: {
  couple: Couple;
  rentPct: number | null;
  month: string;
  hasExpenses: boolean;
  yearToPurge: number;
  purgeDate: string;
}) {
  const { names, salaries } = couple;
  return (
    <section aria-labelledby="ajustes" className="card p-5">
      <h2 id="ajustes" className="text-[17px] font-extrabold tracking-tight">
        Ajustes
      </h2>

      {rentPct !== null && (
        <div className="mt-3">
          <p className="text-xs font-bold text-ink2">Reparto del alquiler según sueldos</p>
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-seg">
            <div className="rounded-full bg-p1" style={{ width: `${rentPct}%` }} />
            <div className="rounded-full bg-p2" style={{ width: `${100 - rentPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold text-ink2">
            <span>
              {names[1]} {formatPct(rentPct)}
            </span>
            <span>
              {names[2]} {formatPct(100 - rentPct)}
            </span>
          </div>
        </div>
      )}

      <details className="group mt-4 rounded-xl border border-line bg-field">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
          Nombres y sueldos
          <span className="text-xs font-semibold text-brand group-open:hidden">Editar</span>
        </summary>
        <div className="border-t border-line p-4">
          <CoupleForm names={names} salaries={salaries} configured />
          <p className="mt-3 text-xs font-medium text-mute">Los cambios de sueldo se aplican a los alquileres que registréis a partir de ahora.</p>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <a
          href={`/api/export?mes=${month}`}
          download
          className="btn-secondary"
          title={hasExpenses ? "Descargar los gastos de este mes" : "Descargar una plantilla vacía para rellenar"}
        >
          <IconDownload className="h-[18px] w-[18px]" /> {hasExpenses ? "Exportar Excel" : "Plantilla Excel"}
        </a>
        <ImportButton />
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-pend-bg px-3 py-2.5 text-xs font-semibold text-pend-fg">
        <IconInfo className="mt-0.5 h-4 w-4 shrink-0" />
        Se conservan dos años de datos. {yearToPurge} se eliminará el {formatDate(purgeDate, "long")}.
      </p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-10 w-56 rounded-xl bg-seg" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="h-48 rounded-[20px] bg-[#d9d0f2] lg:col-start-2" />
        <div className="h-96 rounded-[20px] bg-seg lg:col-start-1 lg:row-start-1 lg:row-span-2" />
        <div className="h-40 rounded-[20px] bg-seg lg:col-start-2" />
      </div>
    </div>
  );
}
