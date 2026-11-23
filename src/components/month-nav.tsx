"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/components/icons";
import { formatMonth, monthShortName, shiftMonth, type MonthKey } from "@/lib/periods";

/**
 * Selector de mes: «‹ Noviembre 2026 ›». Las flechas van de mes en mes y, al tocar el nombre,
 * se abre un desplegable con el año y los doce meses. Los meses sin gastos se ven apagados.
 */
export function MonthNav({
  basePath,
  month,
  currentMonth,
  firstMonth,
  monthsWithData,
  query = {},
}: {
  basePath: string;
  month: MonthKey;
  currentMonth: MonthKey;
  firstMonth: MonthKey;
  monthsWithData: MonthKey[];
  /** Otros parámetros de la dirección que hay que conservar (p. ej. la persona en Gráficos). */
  query?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(Number(month.slice(0, 4)));
  const ref = useRef<HTMLDivElement>(null);
  const hasData = new Set(monthsWithData);
  const firstYear = Number(firstMonth.slice(0, 4));
  const lastYear = Number(currentMonth.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  const hrefFor = (m: MonthKey) => {
    const params = new URLSearchParams(query);
    if (m !== currentMonth) params.set("mes", m);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const allowed = (m: MonthKey) => m >= firstMonth && m <= currentMonth;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const arrow = "flex h-10 w-10 items-center justify-center rounded-xl text-ink2 transition";

  return (
    <div ref={ref} className="relative flex items-center justify-between sm:justify-start sm:gap-1">
      {allowed(prev) ? (
        <Link href={hrefFor(prev)} aria-label="Mes anterior" className={`${arrow} hover:bg-seg`}>
          <IconChevronLeft className="h-5 w-5" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${arrow} text-[#c9c4bc]`}>
          <IconChevronLeft className="h-5 w-5" />
        </span>
      )}

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setViewYear(Number(month.slice(0, 4)));
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-base font-bold transition hover:bg-seg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {formatMonth(month).replace(" de ", " ")}
        <IconChevronDown className={`h-4 w-4 text-ink2 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {allowed(next) ? (
        <Link href={hrefFor(next)} aria-label="Mes siguiente" className={`${arrow} hover:bg-seg`}>
          <IconChevronRight className="h-5 w-5" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${arrow} text-[#c9c4bc]`}>
          <IconChevronRight className="h-5 w-5" />
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Elegir mes"
          className="pop-in absolute top-full left-1/2 z-40 mt-2 w-[min(94vw,340px)] -translate-x-1/2 rounded-2xl border border-line bg-white p-3 shadow-xl sm:left-0 sm:translate-x-0"
        >
          {years.length > 1 && (
            <div className="seg mb-3" role="group" aria-label="Año">
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={y === viewYear} onClick={() => setViewYear(y)} className="seg-item tabular-nums">
                  {y}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => `${viewYear}-${String(i + 1).padStart(2, "0")}`).map((m) => {
              const base = "rounded-xl py-2.5 text-center text-sm";
              if (!allowed(m)) {
                return (
                  <span key={m} aria-disabled="true" className={`${base} cursor-not-allowed font-semibold text-[#c9c4bc]`}>
                    {monthShortName(m)}
                  </span>
                );
              }
              return (
                <Link
                  key={m}
                  href={hrefFor(m)}
                  onClick={() => setOpen(false)}
                  aria-current={m === month ? "page" : undefined}
                  title={hasData.has(m) ? undefined : "Sin gastos"}
                  className={`${base} transition ${
                    m === month
                      ? "bg-brand font-extrabold text-white"
                      : hasData.has(m)
                        ? "font-bold text-ink hover:bg-brand-soft"
                        : "font-semibold text-mute hover:bg-field"
                  }`}
                >
                  {monthShortName(m)}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
