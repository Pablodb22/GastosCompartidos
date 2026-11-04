"use client";

import { useEffect, useId, useRef, useState } from "react";

/*
 * Gráficos de la sección «Gráficos». Reglas que siguen todos:
 *  - Marcas finas (barras ≤ 24 px con el extremo redondeado, líneas de 2 px).
 *  - El texto va siempre en tinta neutra; el color solo lo llevan las marcas.
 *  - Cada valor se puede leer sin pasar el ratón (etiquetas o tabla); el aviso
 *    al pasar el ratón o enfocar con el teclado solo añade detalle.
 */

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
export const formatEUR = (n: number) => eur.format(n);

/** Variación respecto al mes anterior. Gastar más es «malo» (rojo), gastar menos, «bueno» (verde). */
export function Delta({ now, prev, prevLabel }: { now: number; prev: number | null; prevLabel: string }) {
  if (prev === null) return <span className="text-slate-400">Sin datos de {prevLabel}</span>;
  const diff = Math.round((now - prev) * 100) / 100;
  if (Math.abs(diff) < 0.005) return <span className="text-slate-500">= igual que {prevLabel}</span>;
  const up = diff > 0;
  const rel = prev > 0 ? ` (${up ? "+" : "−"}${pct.format(Math.abs((diff / prev) * 100))} %)` : "";
  return (
    <span className={up ? "text-[#b42318]" : "text-[#006300]"}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
      {eur.format(Math.abs(diff))}
      {rel} <span className="text-slate-500">vs {prevLabel}</span>
    </span>
  );
}

// ---------- Tarjeta de cifra ----------

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 px-3.5 py-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="font-display mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight font-semibold">{sub}</p>}
    </div>
  );
}

// ---------- Barras horizontales ordenadas ----------

export type BarDatum = {
  key: string;
  label: string;
  emoji: string;
  value: number;
  pct: number;
  count: number;
  prev: number | null;
};

/** Desglose por categoría: una barra por categoría, de mayor a menor, en el color de la persona. */
export function RankedBars({ data, color, prevLabel }: { data: BarDatum[]; color: string; prevLabel: string }) {
  const max = Math.max(...data.map((d) => Math.max(d.value, d.prev ?? 0)), 1);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li
          key={d.key}
          tabIndex={0}
          className="group relative rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-violet-100"
          aria-label={`${d.label}: ${eur.format(d.value)}, ${pct.format(d.pct)} % de su gasto, ${d.count} ${
            d.count === 1 ? "gasto" : "gastos"
          }${d.prev !== null ? `; en ${prevLabel}, ${eur.format(d.prev)}` : ""}`}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-bold text-slate-700">
              <span aria-hidden="true">{d.emoji}</span> {d.label}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-extrabold text-slate-900">{eur.format(d.value)}</span>
              <span className="ml-1.5 text-xs font-bold text-slate-400">{pct.format(d.pct)} %</span>
            </span>
          </div>
          {/* Barra actual y, debajo, una línea fina con el mes anterior como referencia. */}
          <div className="mt-1.5 h-3 w-full">
            <div
              className="h-3 rounded-r-[4px] transition-[filter] group-hover:brightness-110"
              style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? 3 : 0, background: color }}
            />
          </div>
          {d.prev !== null && (
            <div className="mt-1 h-1 w-full">
              <div className="h-1 rounded-r-[2px] bg-[#c3c2b7]" style={{ width: `${(d.prev / max) * 100}%` }} />
            </div>
          )}
          <Tip>
            <TipValue>{eur.format(d.value)}</TipValue>
            <TipRow>
              {d.count} {d.count === 1 ? "gasto" : "gastos"} · {pct.format(d.pct)} % de su gasto
            </TipRow>
            {d.prev !== null && (
              <TipRow>
                En {prevLabel}: {eur.format(d.prev)}
              </TipRow>
            )}
          </Tip>
        </li>
      ))}
    </ul>
  );
}

// ---------- Aviso al pasar el ratón (solo CSS) ----------

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute -top-2 right-0 z-10 -translate-y-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </div>
  );
}
const TipValue = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-extrabold tabular-nums">{children}</p>
);
const TipRow = ({ children }: { children: React.ReactNode }) => <p className="text-white/75">{children}</p>;

// ---------- Leyenda ----------

export function Legend({ items }: { items: { label: string; color: string; kind?: "rect" | "line" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={i.kind === "line" ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ---------- Línea acumulada (este mes frente al anterior) ----------

function niceMax(v: number) {
  if (v <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

export function CumulativeLine({
  current,
  previous,
  days,
  color,
  currentLabel,
  prevLabel,
}: {
  current: number[];
  previous: number[] | null;
  days: number;
  color: string;
  currentLabel: string;
  prevLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 190;
  const m = { top: 14, right: 14, bottom: 26, left: 52 };
  const xDays = Math.max(days, previous?.length ?? 0);
  const maxVal = niceMax(Math.max(...current, ...(previous ?? []), 1));
  const x = (i: number) => m.left + (i / Math.max(1, xDays - 1)) * (width - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / maxVal) * (H - m.top - m.bottom);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);
  const xTicks = [1, 8, 15, 22, xDays].filter((d, i, a) => d <= xDays && a.indexOf(d) === i);

  const last = current.length - 1;
  const active = hover ?? null;

  const pick = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const rel = (clientX - rect.left - m.left) / (width - m.left - m.right);
    setHover(Math.max(0, Math.min(xDays - 1, Math.round(rel * (xDays - 1)))));
  };

  const valueAt = (vals: number[] | null, i: number) => (vals && i < vals.length ? vals[i] : null);

  return (
    <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden">
      <svg
        width={width}
        height={H}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        className="block touch-pan-y outline-none focus-visible:rounded-xl focus-visible:ring-4 focus-visible:ring-violet-100"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(xDays - 1, (h ?? last) + 1));
          else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
          else return;
          e.preventDefault();
        }}
        onFocus={() => setHover(last >= 0 ? last : 0)}
      >
        <title id={titleId}>
          {`Gasto acumulado: ${currentLabel} ${formatEUR(current[last] ?? 0)} hasta el día ${last + 1}` +
            (previous ? `; ${prevLabel} cerró en ${formatEUR(previous[previous.length - 1] ?? 0)}` : "")}
        </title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#c3c2b7" : "#ecebe6"} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#898781] text-[11px] tabular-nums">
              {eur0.format(t)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} x={x(d - 1)} y={H - 6} textAnchor="middle" className="fill-[#898781] text-[11px] tabular-nums">
            {d}
          </text>
        ))}

        {previous && (
          <path d={path(previous)} fill="none" stroke="#b4b2a9" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {current.length > 0 && (
          <>
            <path
              d={`${path(current)}L${x(last).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`}
              fill={color}
              opacity={0.1}
            />
            <path d={path(current)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last)} cy={y(current[last])} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}

        {active !== null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={H - m.bottom} stroke="#898781" strokeWidth={1} />
            {valueAt(previous, active) !== null && (
              <circle cx={x(active)} cy={y(valueAt(previous, active)!)} r={4} fill="#b4b2a9" stroke="#fff" strokeWidth={2} />
            )}
            {valueAt(current, active) !== null && (
              <circle cx={x(active)} cy={y(valueAt(current, active)!)} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
            )}
          </g>
        )}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: Math.min(Math.max(x(active) - 72, 0), width - 150),
          }}
        >
          <p className="mb-1 font-bold text-white/70">Hasta el día {active + 1}</p>
          {(
            [
              [currentLabel, valueAt(current, active), color],
              [prevLabel, valueAt(previous, active), "#b4b2a9"],
            ] as const
          )
            .filter(([, v]) => v !== null)
            .map(([label, v, c]) => (
              <p key={label} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: c }} />
                <span className="font-extrabold tabular-nums">{formatEUR(v!)}</span>
                <span className="text-white/70">{label}</span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------- Columnas apiladas por mes (pareja) ----------

export type StackSeries = { key: string; label: string; color: string };
export type StackColumn = { key: string; label: string; values: Record<string, number>; total: number; active: boolean };

export function StackedColumns({ columns, series }: { columns: StackColumn[]; series: StackSeries[] }) {
  const max = niceMax(Math.max(...columns.map((c) => c.total), 1));
  const H = 200;
  // Altura útil: se reserva arriba sitio para la etiqueta del total.
  const PH = H - 22;
  const yTop = (t: number) => H - (t / max) * PH;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  return (
    <div className="flex gap-2">
      {/* Eje Y */}
      <div className="relative w-12 shrink-0" style={{ height: H }} aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2 text-[11px] text-[#898781] tabular-nums"
            style={{ top: yTop(t) }}
          >
            {eur0.format(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative flex items-end justify-around gap-2 border-b border-[#c3c2b7]" style={{ height: H }}>
          {ticks.slice(1).map((t) => (
            <span
              key={t}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-[#ecebe6]"
              style={{ top: yTop(t) }}
            />
          ))}
          {columns.map((c, ci) => (
            <div key={c.key} className="relative flex h-full w-full max-w-20 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-extrabold text-slate-900 tabular-nums">{eur0.format(c.total)}</span>
              {/* De abajo arriba en el orden de la leyenda; 2 px de separación entre tramos. */}
              <div className="flex w-full max-w-12 flex-col-reverse gap-[2px]">
                {series.map((s, i) => {
                  const v = c.values[s.key] ?? 0;
                  if (v <= 0) return null;
                  const top = series.slice(i + 1).every((n) => (c.values[n.key] ?? 0) <= 0);
                  return (
                    <div
                      key={s.key}
                      tabIndex={0}
                      aria-label={`${c.label}, ${s.label}: ${formatEUR(v)}`}
                      className={`group relative outline-none hover:brightness-110 focus-visible:ring-4 focus-visible:ring-violet-200 ${
                        top ? "rounded-t-[4px]" : ""
                      } ${c.active ? "" : "opacity-55"}`}
                      style={{ height: Math.max(2, (v / max) * PH), background: s.color }}
                    >
                      <div
                        role="tooltip"
                        className={`pointer-events-none absolute bottom-full z-10 mb-2 ${
                          ci === 0 ? "left-0" : ci === columns.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                        } rounded-xl bg-slate-900 px-3 py-2 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}
                      >
                        <p className="text-sm font-extrabold tabular-nums">{formatEUR(v)}</p>
                        <p className="text-white/75">
                          {s.label} · {c.label} · {pct.format((v / c.total) * 100)} %
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-around gap-2">
          {columns.map((c) => (
            <span
              key={c.key}
              className={`w-full max-w-20 text-center text-xs capitalize ${c.active ? "font-extrabold text-slate-900" : "font-semibold text-slate-500"}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Barra segmentada fina (quién ha pagado) ----------

export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return <p className="text-sm font-semibold text-slate-400">Aún no hay gastos comunes este mes.</p>;
  return (
    <div>
      <div className="flex h-2 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${formatEUR(p.value)}`).join(", ")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} className="h-2 rounded-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="mt-2 flex justify-between gap-3 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className={`flex items-center gap-1.5 ${i ? "text-right" : ""}`}>
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="font-bold text-slate-700">{p.label}</span>
            <span className="font-extrabold text-slate-900 tabular-nums">{formatEUR(p.value)}</span>
            <span className="text-xs font-bold text-slate-400">{pct.format((p.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
