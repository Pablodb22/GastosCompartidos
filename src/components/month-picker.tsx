import Link from "next/link";
import { monthShortName, type MonthKey, type Retention } from "@/lib/periods";

/**
 * Selector de año y mes para navegar por los dos años que se conservan.
 * Los meses sin datos se ven más apagados (pero se pueden abrir) y los
 * futuros no se pueden elegir. El año anterior solo aparece si tiene datos.
 */
export function MonthPicker({
  basePath,
  month,
  retention,
  monthsWithData,
}: {
  basePath: string;
  month: MonthKey;
  retention: Retention;
  monthsWithData: MonthKey[];
}) {
  const year = Number(month.slice(0, 4));
  const hasData = new Set(monthsWithData);
  const hrefFor = (m: MonthKey) => (m === retention.currentMonth ? basePath : `${basePath}?mes=${m}`);

  const shownYears = retention.years.filter(
    (y) => y === retention.currentYear || y === year || monthsWithData.some((m) => m.startsWith(`${y}-`)),
  );

  /** Al cambiar de año se abre su último mes con datos (o el mes en curso / diciembre). */
  const targetFor = (y: number): MonthKey => {
    const withData = monthsWithData.filter((m) => m.startsWith(`${y}-`)).sort();
    if (withData.length) return withData[withData.length - 1];
    return y === retention.currentYear ? retention.currentMonth : `${y}-12`;
  };

  const chip = (active: boolean) =>
    `rounded-full px-2 py-1.5 text-center text-xs font-extrabold transition sm:px-3 sm:text-sm ${
      active ? "bg-linear-to-r from-violet-600 to-fuchsia-500 text-white shadow-md" : ""
    }`;

  return (
    <div className="flex flex-col gap-2">
      {shownYears.length > 1 && (
        <nav aria-label="Año" className="inline-flex w-fit gap-1 rounded-full border-2 border-white bg-white/80 p-1 shadow-sm">
          {shownYears.map((y) => (
            <Link
              key={y}
              href={hrefFor(targetFor(y))}
              aria-current={y === year ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-extrabold tabular-nums transition ${
                y === year ? "bg-violet-950 text-white shadow-md" : "text-violet-700 hover:bg-violet-100"
              }`}
            >
              {y}
            </Link>
          ))}
        </nav>
      )}

      <nav
        aria-label={`Meses de ${year}`}
        className="grid w-full grid-cols-6 gap-1 rounded-3xl border-2 border-white bg-white/80 p-1 shadow-sm sm:inline-grid sm:w-fit sm:grid-cols-12 sm:rounded-full"
      >
        {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((m) => {
          const allowed = m >= retention.months[0] && m <= retention.currentMonth;
          const active = m === month;
          if (!allowed) {
            return (
              <span key={m} aria-disabled="true" className={`${chip(false)} cursor-not-allowed text-slate-300`}>
                {monthShortName(m)}
              </span>
            );
          }
          return (
            <Link
              key={m}
              href={hrefFor(m)}
              aria-current={active ? "page" : undefined}
              title={hasData.has(m) ? undefined : "Sin gastos"}
              className={`${chip(active)} ${
                active ? "" : hasData.has(m) ? "text-violet-700 hover:bg-violet-100" : "text-violet-300 hover:bg-violet-50"
              }`}
            >
              {monthShortName(m)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
