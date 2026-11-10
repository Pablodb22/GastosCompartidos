"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bigFormatter, slideText, type Big, type Slide, type ThemeKey, type Tone, type Visual } from "@/lib/wrapped-slides";

/*
 * Visor del Wrapped en formato «historias».
 *  - Toque a la derecha: siguiente · a la izquierda: anterior · mantener pulsado: pausa.
 *  - Teclado: ← → para moverse, espacio para pausar, Esc para salir.
 *  - Avanza solo (barras de progreso arriba); no avanza solo si se prefiere reducir el movimiento.
 *  - Todo el tamaño va en unidades de contenedor (cqw): el mismo diseño sirve en móvil y en
 *    un «móvil» centrado en el ordenador.
 */

const GRADIENTS: Record<ThemeKey, string> = {
  violet: "linear-gradient(165deg,#2e1065 0%,#5b21b6 50%,#a21caf 100%)",
  pink: "linear-gradient(165deg,#500724 0%,#9d174d 50%,#c2410c 100%)",
  blue: "linear-gradient(165deg,#172554 0%,#1d4ed8 55%,#6d28d9 100%)",
  orange: "linear-gradient(165deg,#431407 0%,#9a3412 50%,#be123c 100%)",
  teal: "linear-gradient(165deg,#042f2e 0%,#0f766e 55%,#1d4ed8 100%)",
  rose: "linear-gradient(165deg,#4c0519 0%,#be123c 55%,#7e22ce 100%)",
  grape: "linear-gradient(165deg,#1e1b4b 0%,#6d28d9 55%,#c026d3 100%)",
  magenta: "linear-gradient(165deg,#3b0764 0%,#a21caf 55%,#db2777 100%)",
};

const TONES: Record<Tone, string> = {
  a: "#93c5fd",
  b: "#6ee7b7",
  c: "#fcd34d",
  p1: "#c4b5fd",
  p2: "#f9a8d4",
};

// Emojis decorativos que flotan por detrás: posición, tamaño y ritmo fijos (sin azar, para que no cambien).
const FLOATERS = [
  { top: "9%", left: "6%", size: 11, d: 5.5, delay: 0 },
  { top: "17%", left: "80%", size: 8, d: 6.5, delay: 0.8 },
  { top: "44%", left: "88%", size: 13, d: 7, delay: 1.6 },
  { top: "62%", left: "3%", size: 9, d: 6, delay: 0.4 },
  { top: "80%", left: "74%", size: 10, d: 5, delay: 1.2 },
  { top: "88%", left: "14%", size: 7, d: 6.8, delay: 2 },
];

const subscribeMedia = (query: string) => (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMedia("(prefers-reduced-motion: reduce)"),
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function usePageHidden() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.hidden,
    () => false,
  );
}

const canShareSnapshot = () => typeof navigator.share === "function";
function useCanShare() {
  return useSyncExternalStore(
    () => () => {},
    canShareSnapshot,
    () => false,
  );
}

export function WrappedStory({ slides, year, shareText }: { slides: Slide[]; year: number; shareText: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const hidden = usePageHidden();
  const reduced = useReducedMotion();
  const canShare = useCanShare();
  const frameRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<{ x: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heldRef = useRef(false);

  const last = slides.length - 1;
  const slide = slides[index];
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const stopped = paused || held || hidden;

  // Teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Toques: corto = navegar (izquierda / derecha); largo = pausa mientras se mantiene.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nostory]")) return;
    downRef.current = { x: e.clientX };
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setHeld(true);
    }, 250);
  };
  const endPress = (e: React.PointerEvent, navigate: boolean) => {
    clearTimeout(holdTimer.current);
    const down = downRef.current;
    downRef.current = null;
    setHeld(false);
    if (!down || !navigate || heldRef.current) return;
    const rect = frameRef.current!.getBoundingClientRect();
    if ((e.clientX - rect.left) / rect.width < 0.33) prev();
    else next();
  };

  return (
    <main
      aria-label={`Wrapped ${year}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={prev}
        disabled={index === 0}
        aria-label="Diapositiva anterior"
        className="mr-4 hidden h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30 sm:flex"
      >
        ‹
      </button>

      <div
        ref={frameRef}
        role="region"
        aria-roledescription="carrusel"
        aria-label={`Wrapped ${year}`}
        className="@container relative h-dvh w-full touch-manipulation overflow-hidden bg-violet-950 text-white sm:h-[min(94dvh,880px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[2.5rem] sm:shadow-2xl"
        onPointerDown={onPointerDown}
        onPointerUp={(e) => endPress(e, true)}
        onPointerCancel={(e) => endPress(e, false)}
        onPointerLeave={(e) => {
          if (downRef.current) endPress(e, false);
        }}
      >
        {/* Cada diapositiva lleva su fondo; al cambiar, el nuevo aparece con un fundido. */}
        <div key={index} className="story-fade absolute inset-0" style={{ background: GRADIENTS[slide.theme] }}>
          <div aria-hidden="true">
            {FLOATERS.map((f, i) => (
              <span
                key={i}
                className="story-float absolute opacity-15"
                style={{
                  top: f.top,
                  left: f.left,
                  fontSize: `${f.size}cqw`,
                  ["--d" as string]: `${f.d}s`,
                  ["--delay" as string]: `${f.delay}s`,
                }}
              >
                {slide.emoji}
              </span>
            ))}
          </div>
          <SlideContent
            slide={slide}
            reduced={reduced}
            onReplay={() => setIndex(0)}
            year={year}
            shareText={shareText}
            canShare={canShare}
          />
        </div>

        {/* Barras de progreso y controles. */}
        <div className="absolute inset-x-0 top-0 z-20 px-[4cqw] pt-[3.5cqw]" data-nostory>
          <div
            className="flex gap-[1.2cqw]"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={slides.length}
            aria-valuenow={index + 1}
            aria-label="Progreso"
          >
            {slides.map((s, i) => (
              <div key={s.id} className="h-[0.9cqw] min-h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  key={i === index ? `on-${index}` : `off-${i}`}
                  className={`h-full w-full rounded-full bg-white ${i === index && !s.final ? "story-progress-fill" : ""}`}
                  style={{
                    transform: i < index || (i === index && s.final) ? "scaleX(1)" : i === index ? undefined : "scaleX(0)",
                    animationDuration: `${s.ms ?? 6500}ms`,
                    animationPlayState: stopped ? "paused" : "running",
                  }}
                  onAnimationEnd={i === index ? next : undefined}
                />
              </div>
            ))}
          </div>
          <div className="mt-[3cqw] flex items-center justify-between">
            <span className="text-[3.6cqw] font-extrabold tracking-wide opacity-90">🎁 Wrapped {year}</span>
            <div className="flex items-center gap-[2cqw]">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Reanudar" : "Pausar"}
                aria-pressed={paused}
                className="flex h-[9cqw] w-[9cqw] items-center justify-center rounded-full bg-black/25 text-[4cqw] transition hover:bg-black/40"
              >
                {paused ? "▶" : "⏸"}
              </button>
              <Link
                href="/wrapped"
                aria-label="Cerrar"
                className="flex h-[9cqw] w-[9cqw] items-center justify-center rounded-full bg-black/25 text-[4.2cqw] transition hover:bg-black/40"
              >
                ✕
              </Link>
            </div>
          </div>
        </div>

        {/* Para lectores de pantalla: la diapositiva en texto, anunciada al cambiar. */}
        <p className="sr-only">
          Usad las flechas izquierda y derecha para cambiar de diapositiva y la barra espaciadora para pausar.
        </p>
        <p className="sr-only" aria-live="polite">
          {`Diapositiva ${index + 1} de ${slides.length}. ${slideText(slide)}`}
        </p>
      </div>

      <button
        type="button"
        onClick={next}
        disabled={index === last}
        aria-label="Diapositiva siguiente"
        className="ml-4 hidden h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30 sm:flex"
      >
        ›
      </button>
    </main>
  );
}

// ---------- Contenido de una diapositiva ----------

function SlideContent({
  slide: s,
  reduced,
  onReplay,
  year,
  shareText,
  canShare,
}: {
  slide: Slide;
  reduced: boolean;
  onReplay: () => void;
  year: number;
  shareText: string;
  canShare: boolean;
}) {
  return (
    <div className="relative z-10 flex h-full flex-col px-[7cqw] pt-[19cqw] pb-[8cqw]">
      <div className="flex min-h-0 flex-1 flex-col" aria-hidden="true">
        <div className="flex flex-1 flex-col justify-center gap-[3.5cqw]">
          <span className="story-pop block text-[17cqw] leading-none">{s.emoji}</span>
          {s.kicker && (
            <p
              className="story-in text-[4.4cqw] leading-tight font-extrabold tracking-wide uppercase opacity-90"
              style={{ ["--i" as string]: 0 }}
            >
              {s.kicker}
            </p>
          )}
          {s.title && (
            <h2
              className="story-in font-display text-[9.6cqw] leading-[1.05] font-semibold text-balance"
              style={{ ["--i" as string]: 1 }}
            >
              {s.title}
            </h2>
          )}
          {s.big && <BigNumber big={s.big} reduced={reduced} />}
          {s.visual && <VisualView visual={s.visual} />}
          {s.text && (
            <p className="story-in text-[5cqw] leading-snug font-bold text-pretty" style={{ ["--i" as string]: 4 }}>
              {s.text}
            </p>
          )}
        </div>

        {s.footnote && (
          <p className="story-in mt-[3cqw] text-[3.7cqw] leading-snug font-semibold opacity-85" style={{ ["--i" as string]: 6 }}>
            {s.footnote}
          </p>
        )}
      </div>

      {s.final && (
        <div className="story-in mt-[4cqw] flex flex-col gap-[2.5cqw]" style={{ ["--i" as string]: 6 }} data-nostory>
          <button
            type="button"
            onClick={onReplay}
            className="rounded-full bg-white px-[5cqw] py-[3.2cqw] text-[4.6cqw] font-extrabold text-violet-900 shadow-lg transition hover:scale-[1.02]"
          >
            🔁 Volver a verlo
          </button>
          <div className="flex gap-[2.5cqw]">
            {canShare && (
              <button
                type="button"
                onClick={() => void navigator.share({ title: `Wrapped ${year}`, text: shareText }).catch(() => {})}
                className="flex-1 rounded-full bg-white/20 px-[4cqw] py-[3cqw] text-[4.2cqw] font-bold transition hover:bg-white/30"
              >
                📤 Compartir
              </button>
            )}
            <Link
              href="/wrapped"
              className="flex-1 rounded-full bg-white/20 px-[4cqw] py-[3cqw] text-center text-[4.2cqw] font-bold transition hover:bg-white/30"
            >
              Cerrar
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Cifra grande que «cuenta» hasta su valor ----------

function BigNumber({ big, reduced }: { big: Big; reduced: boolean }) {
  const format = useMemo(() => bigFormatter(big), [big]);
  const finalText = format(big.value);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const duration = 1200;
    const start = performance.now() + 250; // espera a que aparezca el resto
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(big.value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [big.value, reduced]);

  // Tamaño según el largo del texto final, para que nunca se salga de la diapositiva.
  const size = `min(21cqw, ${(84 / (finalText.length * 0.6)).toFixed(2)}cqw)`;

  return (
    <div className="story-in" style={{ ["--i" as string]: 2 }}>
      <p className="font-display leading-none font-semibold tabular-nums" style={{ fontSize: size }}>
        {reduced ? finalText : format(value)}
      </p>
      {big.suffix && <p className="mt-[1.5cqw] text-[5.4cqw] leading-tight font-extrabold">{big.suffix}</p>}
    </div>
  );
}

// ---------- Visuales ----------

function VisualView({ visual }: { visual: Visual }) {
  switch (visual.type) {
    case "bars":
      return <Bars items={visual.items} />;
    case "split":
      return <Split parts={visual.parts} />;
    case "ranking":
      return <Ranking items={visual.items} />;
    case "tiles":
      return <Tiles items={visual.items} />;
  }
}

function Bars({ items }: { items: Extract<Visual, { type: "bars" }>["items"] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const dense = items.length > 8;
  return (
    <div className="story-in" style={{ ["--i" as string]: 3 }}>
      <div className={`flex h-[34cqw] items-end ${dense ? "gap-[1.2cqw]" : "gap-[2.2cqw]"}`}>
        {items.map((it, i) => (
          <div key={it.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            {it.highlight && (
              <span className="mb-[1cqw] text-[3.4cqw] font-extrabold whitespace-nowrap tabular-nums">{it.display}</span>
            )}
            <div
              className={`story-grow-y w-full rounded-t-[1.2cqw] ${it.highlight ? "bg-white" : "bg-white/40"}`}
              style={{ height: `${Math.max(3, (it.value / max) * 82)}%`, ["--i" as string]: i }}
            />
          </div>
        ))}
      </div>
      <div className={`mt-[1.5cqw] flex ${dense ? "gap-[1.2cqw]" : "gap-[2.2cqw]"}`}>
        {items.map((it) => (
          <span
            key={it.label}
            className={`min-w-0 flex-1 text-center ${dense ? "text-[2.9cqw]" : "text-[3.4cqw]"} ${
              it.highlight ? "font-extrabold" : "font-semibold opacity-80"
            }`}
          >
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Split({ parts }: { parts: Extract<Visual, { type: "split" }>["parts"] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="story-in" style={{ ["--i" as string]: 3 }}>
      <div className="flex h-[6cqw] gap-[0.8cqw] overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p, i) => (
            <div
              key={p.label}
              className="story-grow-x h-full rounded-full"
              style={{ width: `${(p.value / total) * 100}%`, background: TONES[p.tone], ["--i" as string]: i }}
            />
          ))}
      </div>
      <ul className="mt-[3.5cqw] space-y-[2cqw]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-[3cqw]">
            <span className="flex min-w-0 items-center gap-[2.2cqw] text-[4.6cqw] font-bold">
              <span className="h-[3.4cqw] w-[3.4cqw] shrink-0 rounded-[0.8cqw]" style={{ background: TONES[p.tone] }} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="font-display text-[6cqw] font-semibold tabular-nums">{p.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function Ranking({ items }: { items: Extract<Visual, { type: "ranking" }>["items"] }) {
  return (
    <ol className="space-y-[2cqw]">
      {items.map((it, i) => (
        <li
          key={it.label + i}
          className="story-in flex items-center gap-[3cqw] rounded-[3cqw] bg-white/12 px-[3.5cqw] py-[2.4cqw]"
          style={{ ["--i" as string]: 3 + i * 0.6 }}
        >
          <span className="w-[6cqw] shrink-0 text-center text-[5cqw] font-extrabold">{MEDALS[i] ?? i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[4.4cqw] font-bold">{it.label}</span>
            {it.note && <span className="block truncate text-[3.3cqw] font-semibold opacity-80">{it.note}</span>}
          </span>
          <span className="shrink-0 text-[4.4cqw] font-extrabold tabular-nums">{it.value}</span>
        </li>
      ))}
    </ol>
  );
}

function Tiles({ items }: { items: Extract<Visual, { type: "tiles" }>["items"] }) {
  return (
    <ul className="space-y-[2cqw]">
      {items.map((it, i) => (
        <li
          key={it.label}
          className="story-in rounded-[3cqw] bg-white/12 px-[4cqw] py-[2.6cqw]"
          style={{ ["--i" as string]: 3 + i * 0.6 }}
        >
          <span className="block text-[3.3cqw] font-bold tracking-wide uppercase opacity-80">{it.label}</span>
          <span className="flex items-baseline justify-between gap-[3cqw]">
            <span className="min-w-0 truncate text-[5cqw] font-extrabold">{it.value}</span>
            {it.note && <span className="shrink-0 text-[4cqw] font-bold tabular-nums opacity-90">{it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
