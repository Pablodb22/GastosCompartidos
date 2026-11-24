import Link from "next/link";
import type { ReactNode } from "react";
import { IconBars, IconCards } from "@/components/icons";
import { Logo } from "@/components/logo";
import { WrappedNavLink } from "@/components/wrapped-nav-link";

const TABS = [
  { href: "/", label: "Cuentas", key: "cuentas", Icon: IconCards },
  { href: "/graficos", label: "Gráficos", key: "graficos", Icon: IconBars },
] as const;

type Active = (typeof TABS)[number]["key"] | "wrapped";

/**
 * Barra superior (logo, pestañas en escritorio y acciones) y, en el móvil, barra de pestañas abajo.
 * `actions` va a la derecha de la barra superior (escáner de tickets, «soy yo»…).
 */
export function AppHeader({ active, actions }: { active: Active; actions?: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <Logo className="h-8 w-8" />
            <span className="text-[17px] font-extrabold tracking-tight">Cuentas en pareja</span>
          </Link>

          <nav aria-label="Secciones" className="ml-6 hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active === t.key ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                  active === t.key ? "bg-brand-soft text-brand" : "text-ink2 hover:bg-seg"
                }`}
              >
                <t.Icon className="h-[18px] w-[18px]" />
                {t.label}
              </Link>
            ))}
            <WrappedNavLink active={active === "wrapped"} variant="top" />
          </nav>

          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] border-t border-line bg-white/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] ${
              active === t.key ? "font-bold text-brand" : "font-semibold text-mute"
            }`}
          >
            <t.Icon className="h-[22px] w-[22px]" />
            {t.label}
          </Link>
        ))}
        <WrappedNavLink active={active === "wrapped"} variant="bottom" />
      </nav>
    </>
  );
}
