import type { Metadata } from "next";

import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Entrar — Zima Hotspot",
};

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[140px]" />
          <div className="absolute bottom-[-20%] right-[-10%] h-[26rem] w-[26rem] rounded-full bg-sky-500/[0.07] blur-[130px]" />
        </div>
        {children}
      </div>
    </ToastProvider>
  );
}
