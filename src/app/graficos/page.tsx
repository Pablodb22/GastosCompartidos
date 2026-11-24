import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { PieChart } from "@/components/charts";
import { HeaderActions } from "@/components/header-actions";
import { IconCart, IconCheck, IconHome, IconSparkle, IconTicket, IconUsers } from "@/components/icons";
import { MonthNav } from "@/components/month-nav";
import { beneficiaryOf, formatEUR } from "@/lib/calc";
import type { PersonId } from "@/lib/config";
import { getCouple, listExpensesBetween, listMonthsWithData, purgeExpired } from "@/lib/expenses";
import { getMe } from "@/lib/me";
import { formatMonth, getRetention, lastDayOfMonth } from "@/lib/periods";
import { pieFor } from "@/lib/stats";
import { savingTips, type Tip, type TipIcon } from "@/lib/tips";

export const metadata: Metadata = { title: "Gráficos · Cuentas en pareja" };

export default function ChartsPage({ searchParams }: PageProps<"/graficos">) {
  return (
    <>
      <AppHeader
        active="graficos"
        actions={
          <Suspense>
            <HeaderActions />
          </Suspense>
        }
      />
      <main className="pb-nav mx-auto w-full max-w-3xl flex-1 px-4 pt-4 sm:px-6 sm:pt-6">
        <h1 className="mb-1 text-[22px] font-extrabold tracking-tight">Gráficos</h1>
        <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-[20px] bg-seg" aria-busy="true" />}>
          <Charts searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

type Who = "1" | "2" | "pareja";

async function Charts({ searchParams }: { searchParams: PageProps<"/graficos">["searchParams"] }) {
  const { mes, quien } = await searchParams;
  const retention = getRetention();
  const [couple, me] = await Promise.all([getCouple(), getMe(), purgeExpired(retention)]);
  const month = typeof mes === "string" && retention.months.includes(mes) ? mes : retention.currentMonth;
  const who: Who = quien === "1" || quien === "2" || quien === "pareja" ? quien : String(me ?? 1) as Who;
  const [all, monthsWithData] = await Promise.all([
    listExpensesBetween(`${month}-01`, lastDayOfMonth(month)),
    listMonthsWithData(),
  ]);
  const monthName = formatMonth(month).split(" ")[0].toLowerCase();
  const pie = pieFor(all, month, who === "pareja" ? "pareja" : (Number(who) as PersonId));
  const names = couple.names;

  const hrefFor = (w: Who) => {
    const params = new URLSearchParams({ quien: w });
    if (month !== retention.currentMonth) params.set("mes", month);
    return `/graficos?${params.toString()}`;
  };

  // «Dato»: lo que cada uno se ha dado en caprichos propios (ocio solo suyo).
  const own = (p: PersonId) =>
    all.filter((e) => e.seccion === "ocio" && beneficiaryOf(e) === p).reduce((a, e) => a + e.importe, 0);
  const ownAmount = who === "pareja" ? 0 : own(Number(who) as PersonId);
  const isMe = who !== "pareja" && Number(who) === me;
  let fact: string | null = null;
  if (who !== "pareja" && ownAmount > 0) {
    fact = `Dato: este mes ${isMe ? "te has dado" : `${names[Number(who) as PersonId]} se ha dado`} ${formatEUR(ownAmount)} en caprichos propios. Nadie juzga (la app, un poco).`;
  } else if (who === "pareja" && pie.ocioTotal > 0) {
    fact = `Dato: en pareja habéis gastado ${formatEUR(pie.ocioTotal)} en ocio. Se nota que os queréis (y que os gusta salir).`;
  }

  const tips = savingTips(all, month, who === "pareja" ? "pareja" : (Number(who) as PersonId), me);

  const options: { id: Who; label: string }[] = [
    { id: "1", label: names[1] },
    { id: "2", label: names[2] },
    { id: "pareja", label: "En pareja" },
  ];

  return (
    <div className="space-y-3">
      <MonthNav
        basePath="/graficos"
        month={month}
        currentMonth={retention.currentMonth}
        firstMonth={retention.months[0]}
        monthsWithData={monthsWithData}
        query={{ quien: who }}
      />

      <nav className="seg" aria-label="Ver gráfico de">
        {options.map((o) => (
          <Link
            key={o.id}
            href={hrefFor(o.id)}
            aria-current={who === o.id ? "page" : undefined}
            className={`seg-item truncate py-2.5! aria-[current=page]:bg-white aria-[current=page]:font-bold aria-[current=page]:text-brand aria-[current=page]:shadow-[0_1px_3px_rgb(28_26_46/0.15)]`}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      <section className="card p-5" aria-labelledby="quien">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white ${
              who === "1" ? "bg-p1" : who === "2" ? "bg-p2" : "bg-brand"
            }`}
          >
            {who === "pareja" ? <IconUsers className="h-5 w-5" /> : names[Number(who) as PersonId].slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="quien" className="truncate text-base font-extrabold">
              {who === "pareja" ? "En pareja" : names[Number(who) as PersonId]}
            </h2>
            <p className="text-[12.5px] text-mute">
              {who === "pareja" ? `Gastos comunes de ${monthName}` : `${isMe ? "Tu" : "Su"} parte de ${monthName}`}
            </p>
          </div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatEUR(pie.total)}</p>
        </div>
        <div className="mt-4">
          <PieChart
            slices={pie.slices}
            total={pie.total}
            ocioTotal={pie.ocioTotal}
            title={`${who === "pareja" ? "En pareja" : names[Number(who) as PersonId]}: gastos de ${monthName}`}
          />
        </div>
      </section>

      <Tips tips={tips} who={who} isMe={isMe} />

      {fact && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-brand-soft px-3.5 py-3 text-[13px] leading-snug font-semibold text-[#3b2a9e]">
          <IconSparkle className="h-5 w-5 shrink-0" />
          {fact}
        </p>
      )}
    </div>
  );
}

const TIP_ICON: Record<TipIcon, { Icon: (p: { className?: string }) => React.ReactNode; bg: string }> = {
  ticket: { Icon: IconTicket, bg: "bg-ocio" },
  cart: { Icon: IconCart, bg: "bg-comida" },
  user: { Icon: IconUsers, bg: "bg-brand" },
  home: { Icon: IconHome, bg: "bg-fijos" },
  users: { Icon: IconUsers, bg: "bg-p2" },
  check: { Icon: IconCheck, bg: "bg-comida" },
};

function TipList({ tips }: { tips: Tip[] }) {
  return (
    <ul className="card divide-y divide-line2 overflow-hidden">
      {tips.map((t) => {
        const { Icon, bg } = TIP_ICON[t.icon];
        return (
          <li key={t.title} className="flex gap-3 px-4 py-3">
            <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] text-white ${bg}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[15.5px] leading-snug font-bold">{t.title}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug font-medium text-ink2">{t.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Tips({ tips, who, isMe }: { tips: { own: Tip[]; couple: Tip[] }; who: Who; isMe: boolean }) {
  return (
    <section aria-labelledby="consejos" className="space-y-3 pt-3">
      <div>
        <h2 id="consejos" className="text-[13px] font-bold tracking-wide text-mute uppercase">
          Consejos para ahorrar
        </h2>
        <p className="text-[12.5px] font-medium text-mute">Calculados con los gastos de este mes.</p>
      </div>
      {who !== "pareja" && tips.own.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-base font-extrabold">{isMe ? "Tus gastos individuales" : "Sus gastos individuales"}</h3>
          <TipList tips={tips.own} />
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="text-base font-extrabold">Como pareja</h3>
        <TipList tips={tips.couple} />
      </div>
    </section>
  );
}
