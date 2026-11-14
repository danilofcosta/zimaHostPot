"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bell,
  CircleCheck,
  CircleX,
  Clock,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  ShieldOff,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  Badge,
  EmptyState,
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
  deviceStateLabel,
  eventTypeLabel,
  formatBitRate,
  formatBytes,
  formatClock,
  formatNumber,
  formatRelative,
  severityLabel,
} from "@/lib/format";
import type {
  ConnectedDevicesResponse,
  DeviceSummary,
  EventsResponse,
  HealthResponse,
  HotspotConfig,
  HotspotStatus,
  MonitoringSnapshot,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const REFRESH_MS = 10_000;

interface DashboardData {
  health: HealthResponse | null;
  config: HotspotConfig | null;
  status: HotspotStatus | null;
  summary: DeviceSummary | null;
  connected: ConnectedDevicesResponse | null;
  monitoring: MonitoringSnapshot | null;
  events: EventsResponse | null;
}

export function DashboardOverview() {
  const api = useMemo(() => new HotspotApi(), []);

  const loader = useCallback(
    async (signal: AbortSignal): Promise<DashboardData> => {
      const config = await api.getConfig(false, signal).catch(() => null);
      const interfaceName = config?.interface;
      const profileName = config?.profile_name;

      const [health, summary, connected, monitoring, events] =
        await Promise.all([
          api.health(signal).catch(() => null),
          api.deviceSummary(signal).catch(() => null),
          api.connectedDevices(interfaceName, signal).catch(() => null),
          api
            .monitoringSnapshot(interfaceName, 60, 30, signal)
            .catch(() => null),
          api.events({ limit: 6 }, signal).catch(() => null),
        ]);

      const status =
        config && profileName
          ? await api
              .getStatus(
                { interfaceName: config.interface, profileName },
                signal,
              )
              .catch(() => null)
          : null;

      return { health, config, status, summary, connected, monitoring, events };
    },
    [api],
  );

  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData(loader, REFRESH_MS);

  const active = data?.status?.active ?? false;
  const counts = data?.connected?.counts ?? {};
  const associated =
    (counts.associated ?? 0) +
    (counts.active ?? 0) +
    (counts.dhcp_only ?? 0);
  const rates = data?.monitoring?.rates ?? null;
  const recentClients = data?.connected?.clients.slice(0, 5) ?? [];
  const events = data?.events?.events ?? [];
  const backendOnline = Boolean(data?.health);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        description="Estado do hotspot, dispositivos e tráfego coletados diretamente do host."
        actions={
          <>
            <span className="hidden text-[0.68rem] text-zinc-600 sm:inline">
              atualizado às {formatClock(updatedAt)}
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
            <Link href="/share">
              <Button
                size="sm"
                variant="primary"
                icon={<QrCode className="h-3.5 w-3.5" />}
              >
                Compartilhar
              </Button>
            </Link>
          </>
        }
      />

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hotspot"
          value={
            loading && !data
              ? "…"
              : active
                ? "Ativo"
                : backendOnline
                  ? "Desligado"
                  : "Offline"
          }
          tone={active ? "success" : backendOnline ? "default" : "danger"}
          hint={
            data?.status?.interface
              ? `${data.status.interface}${data.status.ip_address ? ` · ${data.status.ip_address}` : ""}`
              : data?.config?.name
                ? data.config.name
                : "sem configuração carregada"
          }
          icon={active ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Dispositivos conectados"
          value={data?.connected?.count ?? "—"}
          hint={`${associated} associados/ativos · ${counts.inactive ?? 0} inativos`}
          icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Dispositivos conhecidos"
          value={data?.summary?.total_devices ?? "—"}
          hint={`${data?.summary?.online_devices ?? 0} online · ${data?.summary?.blocked_devices ?? 0} bloqueados`}
          icon={<Users className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Tráfego agora"
          value={
            rates
              ? formatBitRate(
                  rates.rx_bits_per_second + rates.tx_bits_per_second,
                )
              : "—"
          }
          hint={
            rates
              ? `↓ ${formatBitRate(rates.rx_bits_per_second)} · ↑ ${formatBitRate(rates.tx_bits_per_second)}`
              : data?.monitoring?.message ?? "sem amostras suficientes"
          }
          icon={<Activity className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Hotspot"
          description="Configuração salva no NetworkManager e estado atual da interface."
          action={
            <Link href="/hotspot">
              <Button size="sm" variant="secondary">
                Gerenciar
              </Button>
            </Link>
          }
        >
          {loading && !data ? (
            <p className="text-sm text-zinc-500">Carregando configuração…</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl border",
                    active
                      ? "status-pulse border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.04] text-zinc-500",
                  )}
                >
                  {active ? (
                    <Wifi className="h-5 w-5" />
                  ) : (
                    <WifiOff className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">
                    {data?.config?.name || "Sem SSID configurado"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {data?.status?.status_text ??
                      (backendOnline
                        ? "Estado ainda não consultado."
                        : "API do hotspot indisponível.")}
                  </p>
                </div>
                <Badge tone={active ? "success" : "muted"} className="ml-auto">
                  {active ? "ativo" : "inativo"}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-4">
                <KeyValue
                  label="Interface"
                  value={data?.config?.interface ?? "—"}
                  mono
                />
                <KeyValue
                  label="Perfil"
                  value={data?.config?.profile_name ?? "—"}
                  mono
                />
                <KeyValue
                  label="Banda"
                  value={
                    data?.config
                      ? data.config.band === "bg"
                        ? "2,4 GHz"
                        : "5 GHz"
                      : "—"
                  }
                />
                <KeyValue
                  label="Senha"
                  value={
                    data?.config
                      ? data.config.password_set
                        ? "definida"
                        : "não definida"
                      : "—"
                  }
                />
              </dl>
            </div>
          )}
        </Panel>

        <Panel
          title="Saúde do serviço"
          description="Resposta real de /health e da API Python."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                {backendOnline ? (
                  <CircleCheck className="h-4 w-4 text-emerald-300" />
                ) : (
                  <CircleX className="h-4 w-4 text-red-300" />
                )}
                API Python
              </span>
              <Badge tone={backendOnline ? "success" : "danger"}>
                {backendOnline
                  ? data?.health?.status === "degraded"
                    ? "degradada"
                    : "ok"
                  : "offline"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                <Wifi className="h-4 w-4 text-sky-300" />
                nmcli
              </span>
              <span className="font-mono text-[0.7rem] text-zinc-400">
                {data?.health?.nmcli_version ??
                  (data?.health ? "indisponível" : "—")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                <Clock className="h-4 w-4 text-amber-300" />
                Amostragem
              </span>
              <span className="font-mono text-[0.7rem] text-zinc-400">
                {data?.monitoring?.sampling_since
                  ? `desde ${formatRelative(data.monitoring.sampling_since)}`
                  : "sem dados"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                <ShieldOff className="h-4 w-4 text-red-300" />
                Bloqueios
              </span>
              <span className="text-xs text-zinc-300">
                {data?.summary?.blocked_devices ?? 0} dispositivo(s)
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Dispositivos conectados"
          description="Associados ao Wi-Fi, vizinhos ARP e leases DHCP."
          action={
            <Link
              href="/devices"
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
            >
              ver todos
            </Link>
          }
        >
          {recentClients.length === 0 ? (
            <EmptyState
              icon={<MonitorSmartphone className="h-5 w-5" />}
              title={
                loading ? "Coletando dispositivos…" : "Nenhum dispositivo observado"
              }
              description={
                loading
                  ? "A primeira coleta pode levar alguns segundos."
                  : "Assim que um dispositivo aparecer no Wi-Fi, ARP ou DHCP ele será listado aqui."
              }
            />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {recentClients.map((client) => (
                <li
                  key={client.mac}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">
                      {client.flags.nickname || client.hostname || client.mac}
                    </p>
                    <p className="truncate font-mono text-[0.66rem] text-zinc-500">
                      {client.mac}
                      {client.ip ? ` · ${client.ip}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {client.flags.internet_blocked ? (
                      <Badge tone="danger">bloqueado</Badge>
                    ) : null}
                    <Badge
                      tone={
                        client.state === "associated"
                          ? "success"
                          : client.state === "active"
                            ? "info"
                            : "muted"
                      }
                    >
                      {deviceStateLabel(client.state)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Eventos recentes"
          description="Registro persistido no SQLite."
          action={
            <Link
              href="/events"
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
            >
              ver todos
            </Link>
          }
        >
          {events.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-5 w-5" />}
              title={loading ? "Carregando eventos…" : "Nenhum evento registrado"}
              description="Conexões, bloqueios e alterações administrativas aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      event.severity === "error"
                        ? "bg-red-400"
                        : event.severity === "warning"
                          ? "bg-amber-400"
                          : event.severity === "success"
                            ? "bg-emerald-400"
                            : "bg-sky-400",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-200">
                      {event.message}
                    </p>
                    <p className="mt-0.5 text-[0.64rem] text-zinc-500">
                      {eventTypeLabel(event.type)} · {severityLabel(event.severity)} ·{" "}
                      {formatRelative(event.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Tráfego da interface"
        description="Contadores acumulados da interface do hotspot."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-zinc-500">
              <ArrowDown className="h-3 w-3 text-sky-300" /> Recebido
            </p>
            <p className="mt-1.5 font-mono text-lg text-zinc-100">
              {formatBytes(data?.monitoring?.counters?.rx_bytes)}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-zinc-500">
              {formatBitRate(rates?.rx_bits_per_second)}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-zinc-500">
              <ArrowUp className="h-3 w-3 text-emerald-300" /> Enviado
            </p>
            <p className="mt-1.5 font-mono text-lg text-zinc-100">
              {formatBytes(data?.monitoring?.counters?.tx_bytes)}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-zinc-500">
              {formatBitRate(rates?.tx_bits_per_second)}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="text-[0.66rem] uppercase tracking-[0.14em] text-zinc-500">
              Pacotes RX / TX
            </p>
            <p className="mt-1.5 font-mono text-lg text-zinc-100">
              {formatNumber(data?.monitoring?.counters?.rx_packets)}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-zinc-500">
              TX {formatNumber(data?.monitoring?.counters?.tx_packets)}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="text-[0.66rem] uppercase tracking-[0.14em] text-zinc-500">
              Estações Wi-Fi
            </p>
            <p className="mt-1.5 font-mono text-lg text-zinc-100">
              {data?.monitoring?.clients?.wifi_stations ?? "—"}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-zinc-500">
              {data?.monitoring?.reset_detected
                ? "reset de contadores detectado"
                : `janela de ${data?.monitoring?.window_seconds ?? 60}s`}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
