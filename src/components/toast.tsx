"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck } from "@/components/icons";

const EVENT = "app-toast";

/** Muestra un aviso breve abajo (p. ej. «Apuntado ✨»). Se puede llamar desde cualquier componente de cliente. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onToast = (e: Event) => {
      clearTimeout(timer.current);
      setMessage({ text: (e as CustomEvent<string>).detail, id: Date.now() });
      timer.current = setTimeout(() => setMessage(null), 3800);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 md:bottom-8">
      <p
        key={message.id}
        role="status"
        className="pop-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white shadow-xl"
      >
        <IconCheck className="h-4 w-4 shrink-0 text-[#7ee0b4]" />
        {message.text}
      </p>
    </div>
  );
}
