"use client";

import { useCallback, useMemo } from "react";
import {
  Activity,
  CircleCheck,
  CircleX,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Wifi,
} from "lucide-react";

import {
  Badge,
  InlineError,
  KeyValue,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePolledData } from "@/hooks/use-polled-data";
import { HotspotApi } from "@/lib/api";
import {
  formatBytes,
  formatClock,
  formatDuration,
  formatNumber,
} from "@/lib/format";
import type { SystemInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const REFRESH_MS = 15_000;

function UsageBar({
  used,
  total,
  tone = "emerald",
}: {
  used: number;
  total: number;
  tone?: "emerald" | "sky";
}) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "emerald" ? "bg-emerald-400/80" : "bg-sky-400/80",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[0.66rem] text-zinc-500">
        {formatBytes(used)} de {formatBytes(total)} · {percent}%
      </p>
    </div>
  );
}

function ToolRow({ name, available }: { name: string; available: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
      <span className="font-mono text-xs text-zinc-300">{name}</span>
      <span className="flex items-center gap-1.5 text-[0.68rem]">
        {available ? (
          <>
            <CircleCheck className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-emerald-300">disponível</span>
          </>
        ) : (
          <>
            <CircleX className="h-3.5 w-3.5 text-red-300" />
            <span className="text-red-300">ausente</span>
          </>
        )}
      </span>
    </div>
  );
}

export function SystemPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const loader = useCallback(
    (signal: AbortSignal) => api.systemInfo(signal),
    [api],
  );
  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<SystemInfo>(loader, REFRESH_MS);

  const memory = data?.memory;
  const disk = data?.disk;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistema"
        title="Sistema"
        description="Informações de host, container, banco de dados, ferramentas de rede e interfaces reportadas pelo NetworkManager."
        actions={
          <>
            <span className="hidden text-[0.68rem] text-zinc-600 sm:inline">
              {formatClock(updatedAt)}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={refresh}
              loading={refreshing}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Atualizar
            </Button>
          </>
        }
      />

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Host"
          value={data?.hostname ?? "—"}
          hint={data?.platform ?? "—"}
          icon={<Server className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Uptime"
          value={
            data?.uptime_seconds !== null && data?.uptime_seconds !== undefined
              ? formatDuration(data.uptime_seconds)
              : "—"
          }
          hint={data ? `${data.system} ${data.kernel}` : "—"}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Dispositivos"
          value={data?.devices.total_devices ?? "—"}
          hint={`${data?.devices.online_devices ?? 0} online · ${data?.devices.blocked_devices ?? 0} bloqueados`}
          icon={<Wifi className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Ambiente"
          value={data?.environment ?? "—"}
          hint={`Python ${data?.python ?? "—"}`}
          icon={<Cpu className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Host e container" description="Leitura de /proc e plataforma.">
          {loading && !data ? (
            <p className="text-sm text-zinc-500">Carregando…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <KeyValue label="Hostname" value={data?.hostname ?? "—"} mono />
              <KeyValue label="Sistema" value={data?.system ?? "—"} />
              <KeyValue label="Kernel" value={data?.kernel ?? "—"} mono />
              <KeyValue label="Arquitetura" value={data?.architecture ?? "—"} />
              <KeyValue label="Plataforma" value={data?.platform ?? "—"} />
              <KeyValue label="Python" value={data?.python ?? "—"} mono />
              <KeyValue
                label="Uptime do host"
                value={
                  data?.uptime_seconds !== null && data?.uptime_seconds !== undefined
                    ? formatDuration(data.uptime_seconds)
                    : "—"
                }
              />
              <KeyValue
                label="Interface padrão"
                value={data?.network.default_route_interface ?? "—"}
                mono
              />
            </dl>
          )}
        </Panel>

        <Panel title="Recursos" description="Memória e disco do container.">
          <div className="space-y-5">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <MemoryStick className="h-4 w-4 text-sky-300" /> Memória
              </p>
              {memory ? (
                <UsageBar used={memory.used_bytes} total={memory.total_bytes} tone="sky" />
              ) : (
                <p className="mt-1 text-xs text-zinc-500">/proc/meminfo indisponível.</p>
              )}
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <HardDrive className="h-4 w-4 text-emerald-300" /> Disco (data)
              </p>
              {disk ? (
                <UsageBar used={disk.used_bytes} total={disk.total_bytes} />
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  Não foi possível ler o uso do disco.
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ferramentas de rede" description="Disponibilidade real no PATH do container.">
          <div className="space-y-2">
            <ToolRow name="nmcli" available={Boolean(data?.backend.nmcli)} />
            <ToolRow name="iw" available={Boolean(data?.backend.iw)} />
            <ToolRow name="ip" available={Boolean(data?.backend.ip)} />
            <ToolRow name="nft" available={Boolean(data?.backend.nft)} />
            {data?.backend.nmcli_version ? (
              <p className="pt-1 font-mono text-[0.66rem] text-zinc-500">
                {data.backend.nmcli_version}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Banco de dados" description="Arquivo SQLite compartilhado.">
          <dl className="grid grid-cols-2 gap-4">
            <KeyValue label="Caminho" value={data?.database.path ?? "—"} mono />
            <KeyValue
              label="Arquivo"
              value={data?.database.exists ? "presente" : "ausente"}
            />
            <KeyValue label="Tamanho" value={formatBytes(data?.database.size_bytes)} />
            <KeyValue label="WAL" value={formatBytes(data?.database.wal_size_bytes)} />
            <KeyValue label="Journal" value={data?.database.journal_mode ?? "—"} />
            <KeyValue label="Integridade" value={data?.database.integrity ?? "—"} />
            <KeyValue label="SQLite" value={data?.database.sqlite_version ?? "—"} mono />
          </dl>
        </Panel>
      </div>

      <Panel
        title="NetworkManager"
        description="Estado geral e interfaces conhecidas."
        bodyClassName="p-0"
      >
        {data?.backend.network_manager &&
        Object.keys(data.backend.network_manager).length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-4 py-3">
            {Object.entries(data.backend.network_manager).map(([key, value]) => (
              <Badge key={key} tone="neutral">
                {key}: {value}
              </Badge>
            ))}
          </div>
        ) : null}

        {(data?.network.interfaces ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Nenhuma interface reportada pelo nmcli.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[0.6rem] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-4 py-2.5 font-semibold">Interface</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Conexão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data?.network.interfaces.map((iface) => (
                  <tr key={iface.name}>
                    <td className="px-4 py-2.5 font-mono text-zinc-200">
                      {iface.name}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{iface.type}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={
                          iface.state.toLowerCase().includes("connected")
                            ? "success"
                            : "muted"
                        }
                      >
                        {iface.state}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[0.68rem] text-zinc-400">
                      {iface.connection ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-white/[0.06] px-4 py-2.5 text-[0.64rem] text-zinc-600">
          {formatNumber(data?.network.wireless.length)} interface(s) Wi-Fi
          reportada(s) por <span className="font-mono">iw dev</span>.
        </p>
      </Panel>
    </div>
  );
}
