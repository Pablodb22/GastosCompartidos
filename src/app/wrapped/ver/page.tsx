import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { WrappedStory } from "@/components/wrapped-story";
import { computeWrapped, ensureWrapped, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { buildSlides, shareText } from "@/lib/wrapped-slides";

export const metadata: Metadata = { title: "Wrapped · Cuentas en pareja" };

export default function WrappedViewPage({ searchParams }: PageProps<"/wrapped/ver">) {
  return (
    <Suspense fallback={<Screen message="Preparando vuestro Wrapped…" emoji="🎁" />}>
      <Viewer searchParams={searchParams} />
    </Suspense>
  );
}

async function Viewer({ searchParams }: { searchParams: PageProps<"/wrapped/ver">["searchParams"] }) {
  const { anio, vista } = await searchParams;
  const retention = getRetention();
  await purgeExpired(retention);

  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : NaN;
  if (Number.isNaN(year)) return <Screen message="Ese Wrapped no existe." emoji="🤷" back />;

  // El definitivo se guarda la primera vez (desde el 1 de diciembre) y a partir de ahí es siempre el mismo.
  let data = await ensureWrapped(year, retention.today);
  // Antes del 1 de diciembre solo se puede ver una vista previa del año en curso (no se guarda).
  if (!data && vista === "previa" && year === retention.currentYear) {
    data = await computeWrapped(year, { preview: true, today: retention.today });
  }
  if (!data) {
    return (
      <Screen
        emoji="🔒"
        message={
          year === retention.currentYear
            ? "Este Wrapped se desbloquea el 1 de diciembre."
            : `No hay gastos de ${year} para preparar un Wrapped.`
        }
        back
      />
    );
  }

  return <WrappedStory slides={buildSlides(data)} year={year} shareText={shareText(data)} />;
}

function Screen({ message, emoji, back }: { message: string; emoji: string; back?: boolean }) {
  return (
    <main className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-linear-to-br from-violet-900 via-fuchsia-800 to-orange-700 px-8 text-center text-white">
      <p className="text-6xl" aria-hidden="true">
        {emoji}
      </p>
      <p className="font-display text-2xl font-semibold">{message}</p>
      {back && (
        <Link href="/wrapped" className="rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-violet-800 shadow">
          ← Volver
        </Link>
      )}
    </main>
  );
}
