import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { WrappedStory } from "@/components/wrapped-story";
import { ensureWrapped, purgeExpired } from "@/lib/expenses";
import { getRetention } from "@/lib/periods";
import { wrappedExpiryDate, wrappedUnlockDate } from "@/lib/wrapped";
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
  const { anio } = await searchParams;
  const retention = getRetention();
  await purgeExpired(retention);

  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : NaN;
  if (Number.isNaN(year)) return <Screen message="Ese Wrapped no existe." emoji="🤷" back />;

  // Solo se puede ver el Wrapped disponible: del 1 de diciembre al 31 de octubre del año siguiente.
  const data = await ensureWrapped(year, retention.today);
  if (!data) {
    const message =
      retention.today < wrappedUnlockDate(year)
        ? "Este Wrapped se crea el 1 de diciembre."
        : retention.today >= wrappedExpiryDate(year)
          ? "Este Wrapped ya no está disponible: se borró el 1 de noviembre."
          : "No hay gastos para preparar este Wrapped.";
    return <Screen emoji="🔒" message={message} back />;
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
