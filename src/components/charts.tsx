"use client";

import { useState } from "react";
import type { PieSlice } from "@/lib/stats";

/*
 * Quesito de la sección «Gráficos».
 *  - Colores validados para daltonismo en este orden, también cuando el último
 *    trozo toca al primero: fijos, comida y hasta 4 conceptos de ocio + «Otro ocio».
 *  - 2 px de hueco blanco entre porciones; el % va dentro solo si cabe.
 *  - El texto va en tinta neutra; el color lo llevan las porciones y las muestras.
 *  - Tocar (o enfocar con el teclado) una porción o una fila de la leyenda
 *    muestra su detalle debajo del gráfico.
 */

const COLORS = {
  fijos: "#2a78d6",
  comida: "#1baf7a",
  ocio: ["#e87ba4", "#eda100", "#e34948", "#008300"],
  otros: "#9a9890",
};
// Etiqueta dentro de la porción: blanca, salvo en el amarillo (casi negra).
const inkOn = (color: string) => (color === "#eda100" ? "#0b0b0b" : "#ffffff");

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const pctFmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

type Colored = PieSlice & { color: string; pct: number; start: number; end: number };

function colorize(slices: PieSlice[], total: number): Colored[] {
  let ocioIdx = 0;
  let angle = -Math.PI / 2; // Empieza arriba, en sentido horario.
  return slices.map((s) => {
    const color =
      s.group === "fijos"
        ? COLORS.fijos
        : s.group === "comida"
          ? COLORS.comida
          : s.key === "ocio:otros"
            ? COLORS.otros
            : COLORS.ocio[ocioIdx++ % COLORS.ocio.length];
    const sweep = (s.value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...s, color, pct: (s.value / total) * 100, start, end: angle };
  });
}

const S = 240;
const C = S / 2;
const R = 92;
const polar = (r: number, a: number) => [C + r * Math.cos(a), C + r * Math.sin(a)] as const;

function slicePath(start: number, end: number, r = R) {
  const [x0, y0] = polar(r, start);
  const [x1, y1] = polar(r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function arcPath(start: number, end: number, r: number) {
  const [x0, y0] = polar(r, start);
  const [x1, y1] = polar(r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

export function PieChart({
  slices,
  total,
  ocioTotal,
  title,
}: {
  slices: PieSlice[];
  total: number;
  ocioTotal: number;
  title: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  if (total <= 0 || slices.length === 0) {
    return <p className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-400">🌱 Sin gastos este mes.</p>;
  }

  const data = colorize(slices, total);
  const current = data.find((d) => d.key === active) ?? null;
  const ocio = data.filter((d) => d.group === "ocio");
  const single = data.length === 1;
  const describe = (d: Colored) =>
    `${d.label}: ${eur.format(d.value)}, ${pctFmt.format(d.pct)} %, ${d.count} ${d.count === 1 ? "gasto" : "gastos"}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="mx-auto block w-full max-w-60"
        role="img"
        aria-label={`${title}. ${data.map(describe).join(". ")}`}
      >
        {data.map((d) => {
          const mid = (d.start + d.end) / 2;
          const lift = active === d.key && !single ? 5 : 0;
          return (
            <g
              key={d.key}
              tabIndex={0}
              role="button"
              aria-label={describe(d)}
              aria-pressed={active === d.key}
              className="cursor-pointer outline-none"
              style={{ transform: `translate(${Math.cos(mid) * lift}px, ${Math.sin(mid) * lift}px)`, transition: "transform .15s" }}
              onPointerEnter={() => setActive(d.key)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive((a) => (a === d.key ? null : d.key))}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
            >
              {single ? (
                <circle cx={C} cy={C} r={R} fill={d.color} />
              ) : (
                <path d={slicePath(d.start, d.end)} fill={d.color} stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />
              )}
              {d.pct >= 7 && (
                <text
                  x={single ? C : polar(R * 0.62, mid)[0]}
                  y={single ? C : polar(R * 0.62, mid)[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={inkOn(d.color)}
                  className="pointer-events-none text-[13px] font-extrabold"
                >
                  {pctFmt.format(d.pct)} %
                </text>
              )}
            </g>
          );
        })}

        {/* Arco fino por fuera que agrupa las porciones de ocio. */}
        {ocio.length > 0 && !(single && ocio.length === 1) && (
          <g aria-hidden="true">
            {ocio.length === data.length ? (
              <circle cx={C} cy={C} r={R + 9} fill="none" stroke="#898781" strokeWidth={3} />
            ) : (
              <path
                d={arcPath(ocio[0].start + 0.03, ocio[ocio.length - 1].end - 0.03, R + 9)}
                fill="none"
                stroke="#898781"
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
            <text
              x={polar(R + 22, (ocio[0].start + ocio[ocio.length - 1].end) / 2)[0]}
              y={polar(R + 22, (ocio[0].start + ocio[ocio.length - 1].end) / 2)[1]}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[15px]"
            >
              🎉
            </text>
          </g>
        )}
      </svg>

      {/* Detalle de la porción tocada. */}
      <p className="mt-1 flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-center text-xs" aria-live="polite">
        {current ? (
          <>
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: current.color }} />
            <span className="font-bold text-slate-700">{current.label}</span>
            <span className="font-extrabold text-slate-900 tabular-nums">{eur.format(current.value)}</span>
            <span className="font-semibold text-slate-500">
              {pctFmt.format(current.pct)} % · {current.count} {current.count === 1 ? "gasto" : "gastos"}
            </span>
          </>
        ) : (
          <span className="font-semibold text-slate-400">Toca una porción para ver el detalle</span>
        )}
      </p>

      {/* Leyenda: fijos, comida y el ocio agrupado con sus conceptos. */}
      <ul className="mt-3 space-y-1 text-sm">
        {data
          .filter((d) => d.group !== "ocio")
          .map((d) => (
            <LegendRow key={d.key} d={d} active={active} setActive={setActive} emoji={d.group === "fijos" ? "🏠" : "🛒"} />
          ))}
        {ocio.length > 0 && (
          <li>
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <span className="font-bold text-slate-700">🎉 Ocio</span>
              <span className="tabular-nums">
                <span className="font-extrabold text-slate-900">{eur.format(ocioTotal)}</span>
                <span className="ml-1.5 text-xs font-bold text-slate-400">{pctFmt.format((ocioTotal / total) * 100)} %</span>
              </span>
            </div>
            <ul className="ml-4 border-l-2 border-slate-100 pl-2">
              {ocio.map((d) => (
                <LegendRow key={d.key} d={d} active={active} setActive={setActive} small />
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}

function LegendRow({
  d,
  active,
  setActive,
  emoji,
  small,
}: {
  d: Colored;
  active: string | null;
  setActive: (k: string | null) => void;
  emoji?: string;
  small?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onPointerEnter={() => setActive(d.key)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(d.key)}
        onBlur={() => setActive(null)}
        onClick={() => setActive(d.key)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition ${
          active === d.key ? "bg-violet-50" : "hover:bg-slate-50"
        } ${small ? "text-[13px]" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
          <span className={`truncate ${small ? "font-semibold text-slate-600" : "font-bold text-slate-700"}`}>
            {emoji && <span aria-hidden="true">{emoji} </span>}
            {d.label}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">
          <span className="font-extrabold text-slate-900">{eur.format(d.value)}</span>
          <span className="ml-1.5 text-xs font-bold text-slate-400">{pctFmt.format(d.pct)} %</span>
        </span>
      </button>
    </li>
  );
}
