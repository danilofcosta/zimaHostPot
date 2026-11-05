import {
  AlertTriangleIcon,
  RefreshIcon,
  WifiIcon,
  WifiOffIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { HotspotStatus } from "@/lib/types";
import { CARD_CLASS, cn, formatTime } from "@/lib/utils";

interface StatusCardProps {
  status: HotspotStatus | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm text-zinc-200" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function StatusCard({
  status,
  loading,
  error,
  updatedAt,
  onRefresh,
}: StatusCardProps) {
  const active = status?.active ?? false;
  const offline = !status && Boolean(error);
  const stale = Boolean(status) && Boolean(error);
  const initialLoading = loading && !status;

  return (
    <section
      className={cn(
        CARD_CLASS,
        "relative overflow-hidden p-5 sm:p-6",
      )}
      aria-busy={loading}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl transition-colors",
          active ? "bg-emerald-500/20" : "bg-zinc-500/10",
        )}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Estado do hotspot
          </p>

          <div className="mt-4 flex items-center gap-4">
            <div
              className={cn(
                "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border",
                active
                  ? "status-pulse border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : offline
                    ? "border-red-400/20 bg-red-400/[0.06] text-red-300"
                    : "border-white/10 bg-white/[0.04] text-zinc-400",
              )}
            >
              {offline ? (
                <WifiOffIcon className="h-6 w-6" />
              ) : (
                <WifiIcon className={cn("h-6 w-6", initialLoading && "opacity-50")} />
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {offline
                  ? "API indisponível"
                  : initialLoading
                    ? "Consultando status…"
                    : active
                      ? "Hotspot ativo"
                      : "Hotspot desligado"}
              </h2>
              <p className="mt-0.5 text-sm text-zinc-400">
                {offline
                  ? "Confira se o servidor está rodando e se a URL da API está correta."
                  : initialLoading
                    ? "Buscando o estado atual da interface."
                    : (status?.status_text ?? "Sem dados de status.")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            icon={
              <RefreshIcon
                className={cn("h-4 w-4", loading && "animate-spin")}
              />
            }
          >
            Atualizar
          </Button>
          <p className="text-[0.68rem] text-zinc-600">
            Atualizado às {formatTime(updatedAt)}
          </p>
        </div>
      </div>

      {error ? (
        <div
          className={cn(
            "relative mt-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3",
            stale
              ? "border-amber-500/20 bg-amber-500/[0.06]"
              : "border-red-500/20 bg-red-500/[0.07]",
          )}
        >
          <AlertTriangleIcon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              stale ? "text-amber-300" : "text-red-300",
            )}
          />
          <p
            className={cn(
              "min-w-0 break-words text-xs leading-relaxed",
              stale ? "text-amber-200/90" : "text-red-200/90",
            )}
          >
            {error}
            {stale ? " Mostrando a última informação conhecida." : null}
          </p>
        </div>
      ) : null}

      <dl className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/[0.06] pt-5 sm:grid-cols-4">
        <Stat label="Conexão" value={status?.connection_name ?? "—"} />
        <Stat label="Endereço IP" value={status?.ip_address ?? "—"} />
        <Stat label="Interface" value={status?.interface ?? "—"} />
        <Stat label="Dispositivo" value={status?.device_state ?? "—"} />
      </dl>

      {loading && !initialLoading ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px overflow-hidden"
        >
          <div className="h-px w-1/3 animate-[status-bar_1.2s_ease-in-out_infinite] bg-emerald-400/70" />
        </div>
      ) : null}
    </section>
  );
}
