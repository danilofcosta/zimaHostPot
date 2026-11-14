import Link from "next/link";

import { QrCodeIcon, WifiIcon } from "@/components/icons";
import type { HealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  health: HealthResponse | null;
  healthChecked: boolean;
}

function HealthPill({ health, healthChecked }: DashboardHeaderProps) {
  if (!health && !healthChecked) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] font-medium text-zinc-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
        Conectando…
      </span>
    );
  }

  if (!health) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/[0.08] px-3 py-1.5 text-[0.68rem] font-medium text-red-300"
        title="Não foi possível consultar a API do hotspot. Verifique os containers."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        API offline
      </span>
    );
  }

  const degraded = health.status === "degraded";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.68rem] font-medium",
        degraded
          ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-300"
          : "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
      )}
      title={[
        `${health.service} v${health.version}`,
        `ambiente: ${health.environment}`,
        `nmcli: ${health.nmcli_version ?? "não disponível"}`,
      ].join(" · ")}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          degraded ? "bg-amber-300" : "bg-emerald-400",
        )}
      />
      {degraded ? "nmcli indisponível" : "API online"}
    </span>
  );
}

export function DashboardHeader({ health, healthChecked }: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-500 text-emerald-950 shadow-[0_14px_40px_-12px_rgba(52,211,153,0.7)]">
          <WifiIcon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Zima Hotspot
            </h1>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              painel
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Gerencie a rede Wi-Fi do dispositivo
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <HealthPill health={health} healthChecked={healthChecked} />
        <Link
          href="/share"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <QrCodeIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Compartilhar</span>
        </Link>
      </div>
    </header>
  );
}
