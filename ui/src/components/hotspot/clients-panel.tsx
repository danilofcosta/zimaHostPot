import {
  NetworkIcon,
  RefreshIcon,
  WifiOffIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { HotspotClient, HotspotClientsResponse } from "@/lib/types";
import {
  CARD_CLASS,
  cn,
  formatDateTime,
  formatRelativeTime,
} from "@/lib/utils";

interface ClientsPanelProps {
  active: boolean;
  interfaceName: string;
  clients: HotspotClientsResponse | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
}

const STATE_LABEL: Record<string, string> = {
  REACHABLE: "confirmado",
  DELAY: "respondendo",
  PROBE: "verificando",
  PERMANENT: "permanente",
  STALE: "ocioso",
  NOARP: "sem ARP",
};

function clientLabel(client: HotspotClient): string {
  return client.hostname?.trim() || "Dispositivo sem nome";
}

function ClientRow({ client }: { client: HotspotClient }) {
  const tooltip = [
    `IP: ${client.ip_address}`,
    client.mac_address ? `MAC: ${client.mac_address}` : null,
    `Estado: ${STATE_LABEL[client.state] ?? client.state}`,
    client.first_seen ? `Primeira vez: ${formatDateTime(client.first_seen)}` : null,
    client.last_seen ? `Última vez: ${formatDateTime(client.last_seen)}` : null,
    client.lease_expires_at
      ? `Lease expira: ${formatDateTime(client.lease_expires_at)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <li className="flex items-center gap-3 py-3" title={tooltip}>
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          client.is_active
            ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.35)]"
            : "bg-zinc-600",
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">
          {clientLabel(client)}
        </p>
        <p className="truncate font-mono text-[0.68rem] text-zinc-500">
          {client.ip_address}
          {client.mac_address ? ` · ${client.mac_address}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-[0.7rem] font-medium",
            client.is_active ? "text-emerald-300" : "text-zinc-500",
          )}
        >
          {client.is_active ? "Ativo" : "Ocioso"}
        </p>
        <p className="text-[0.68rem] text-zinc-500">
          {client.last_seen ? formatRelativeTime(client.last_seen) : "—"}
        </p>
      </div>
    </li>
  );
}

export function ClientsPanel({
  active,
  interfaceName,
  clients,
  loading,
  error,
  updatedAt,
  onRefresh,
}: ClientsPanelProps) {
  const count = clients?.count ?? 0;
  const activeCount = clients?.active_count ?? 0;

  return (
    <section className={cn(CARD_CLASS, "p-5 sm:p-6")}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
          <NetworkIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">Clientes</h2>
          <p className="text-xs text-zinc-500">
            {active
              ? "Quem está conectado nesta interface."
              : "Ligue o hotspot para acompanhar os clientes."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          disabled={!active}
          onClick={onRefresh}
          icon={<RefreshIcon className="h-3.5 w-3.5" />}
          aria-label="Atualizar lista de clientes"
        >
          Atualizar
        </Button>
      </div>

      {!active ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-zinc-500">
          <WifiOffIcon className="h-5 w-5 shrink-0 text-zinc-600" />
          <p>
            Nenhum cliente para mostrar enquanto o hotspot estiver desligado.
          </p>
        </div>
      ) : error && !clients ? (
        <p className="mt-5 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[0.7rem] font-medium text-emerald-300">
              {activeCount} ativo{activeCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-[0.7rem] font-medium text-zinc-400">
              {count} conhecido{count === 1 ? "" : "s"}
            </span>
            <span className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[0.7rem] text-zinc-400">
              if: {(clients?.interface ?? interfaceName) || "—"}
            </span>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200">
              {error}
            </p>
          ) : null}

          {clients && clients.clients.length > 0 ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {clients.clients.map((client) => (
                <ClientRow
                  key={client.mac_address ?? client.ip_address}
                  client={client}
                />
              ))}
            </ul>
          ) : loading && !clients ? (
            <div className="mt-4 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 rounded bg-white/10" />
                    <div className="h-2.5 w-1/2 rounded bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-zinc-500">
              <NetworkIcon className="h-5 w-5 shrink-0 text-zinc-600" />
              <p>
                Nenhum cliente conectado ainda. A lista é atualizada a cada 10 s.
              </p>
            </div>
          )}

          <p className="mt-4 text-[0.7rem] text-zinc-600">
            {updatedAt
              ? `Atualizado ${formatRelativeTime(updatedAt)} · ociosos ficam na lista por um tempo.`
              : "Consultando a tabela de vizinhos da interface…"}
          </p>
        </>
      )}
    </section>
  );
}
