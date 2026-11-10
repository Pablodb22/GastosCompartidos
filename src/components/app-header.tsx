import Link from "next/link";
import { Logo } from "@/components/logo";
import { WrappedNavLink } from "@/components/wrapped-nav-link";

const TABS = [
  { href: "/", label: "Cuentas", emoji: "💸", key: "cuentas" },
  { href: "/graficos", label: "Gráficos", emoji: "📊", key: "graficos" },
] as const;

export function AppHeader({ active }: { active: (typeof TABS)[number]["key"] | "wrapped" }) {
  return (
    <header>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-2 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="hover-wiggle">
            <Logo className="wiggle h-12 w-12 drop-shadow-md" />
          </span>
          <div>
            <h1 className="font-display text-gradient text-2xl font-semibold tracking-tight sm:text-3xl">Cuentas en pareja</h1>
            <p className="text-sm font-semibold text-violet-400">Cuentas claras, amor largo 💜</p>
          </div>
        </div>
        <nav aria-label="Secciones" className="inline-flex gap-1 rounded-full border-2 border-white bg-white/80 p-1 shadow-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-extrabold transition ${
                active === t.key ? "bg-violet-950 text-white shadow-md" : "text-violet-700 hover:bg-violet-100"
              }`}
            >
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </Link>
          ))}
          <WrappedNavLink active={active === "wrapped"} />
        </nav>
      </div>
    </header>
  );
}
