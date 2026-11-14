import {
  PlayIcon,
  PowerIcon,
  ServerIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { HotspotAction } from "@/hooks/use-hotspot";
import type { HotspotStatus } from "@/lib/types";
import { CARD_CLASS, cn } from "@/lib/utils";

interface ControlPanelProps {
  status: HotspotStatus | null;
  pending: HotspotAction | null;
  interfaceName: string;
  profileName: string;
  onStart: () => void;
  onStop: () => void;
  onTeardown: () => void;
}

export function ControlPanel({
  status,
  pending,
  interfaceName,
  profileName,
  onStart,
  onStop,
  onTeardown,
}: ControlPanelProps) {
  const active = status?.active ?? false;
  const busy = pending !== null;

  return (
    <section className={cn(CARD_CLASS, "p-5 sm:p-6")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300">
          <ServerIcon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Controle rápido</h2>
          <p className="text-xs text-zinc-500">
            Sempre usa a interface e o perfil configurados ao lado.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[0.7rem] text-zinc-400">
          if: {interfaceName || "—"}
        </span>
        <span className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[0.7rem] text-zinc-400">
          profile: {profileName || "—"}
        </span>
        <span
          className={cn(
            "rounded-lg border px-2.5 py-1 text-[0.7rem] font-medium",
            active
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : "border-white/10 bg-white/[0.03] text-zinc-400",
          )}
        >
          {active ? "ativo agora" : "inativo"}
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        <Button
          variant="primary"
          block
          icon={<PlayIcon className="h-4 w-4 fill-current" />}
          loading={pending === "start"}
          disabled={busy || active}
          onClick={onStart}
        >
          {active ? "Hotspot já está ligado" : "Ligar hotspot"}
        </Button>

        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="secondary"
            icon={<PowerIcon className="h-4 w-4" />}
            loading={pending === "stop"}
            disabled={busy || !active}
            onClick={onStop}
          >
            Desligar
          </Button>
          <Button
            variant="danger"
            icon={<TrashIcon className="h-4 w-4" />}
            loading={pending === "teardown"}
            disabled={busy}
            onClick={onTeardown}
          >
            Remover
          </Button>
        </div>
      </div>

      <p className="mt-4 text-[0.7rem] leading-relaxed text-zinc-500">
        <strong className="font-medium text-zinc-400">Desligar</strong> mantém o
        perfil salvo para religar depois.{" "}
        <strong className="font-medium text-zinc-400">Remover</strong> apaga o
        perfil do NetworkManager.
      </p>
    </section>
  );
}
