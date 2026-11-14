"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CircleX,
  Clock,
  Radio,
  RefreshCw,
  Wifi,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Badge,
  InlineError,
  InlineInfo,
  KeyValue,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePolledData } from "@/hooks/use-polled-data";
import { HotspotApi } from "@/lib/api";
import {
  formatBitRate,
  formatBytes,
  formatClock,
  formatNumber,
  formatRelative,
} from "@/lib/format";
import type { MonitoringSnapshot, TrafficSample } from "@/lib/types";
import { cn } from "@/lib/utils";

const INTERVALS = [
  { value: 5, label: "5 s" },
  { value: 10, label: "10 s" },
  { value: 30, label: "30 s" },
];

type Mode = "polling" | "stream";

interface ChartPoint {
  time: string;
  rx: number;
  tx: number;
}

function buildChartPoints(samples: TrafficSample[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const seconds = (current.sampled_at_ms - previous.sampled_at_ms) / 1000;
    if (seconds <= 0) continue;
    const rxDelta = current.rx_bytes - previous.rx_bytes;
    const txDelta = current.tx_bytes - previous.tx_bytes;
    points.push({
      time: new Date(current.sampled_at_ms).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      rx: rxDelta >= 0 ? (rxDelta * 8) / seconds : 0,
      tx: txDelta >= 0 ? (txDelta * 8) / seconds : 0,
    });
  }
  return points;
}

export function MonitoringPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const [interfaceName, setInterfaceName] = useState("");
  const [interval, setIntervalSeconds] = useState(5);
  const [mode, setMode] = useState<Mode>("polling");
  const [streamData, setStreamData] = useState<MonitoringSnapshot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamNonce, setStreamNonce] = useState(0);

  const interfacesLoader = useCallback(
    (signal: AbortSignal) => api.monitoringInterfaces(signal),
    [api],
  );
  const interfaces = usePolledData(interfacesLoader, 60_000);

  const pollLoader = useCallback(
    (signal: AbortSignal) =>
      api.monitoringSnapshot(interfaceName || undefined, 60, 120, signal),
    [api, interfaceName],
  );

  const pollInterval = mode === "polling" ? interval * 1000 : 0;
  const polled = usePolledData<MonitoringSnapshot>(
    pollLoader,
    pollInterval,
    `${interfaceName}|${interval}|${mode}`,
  );

  useEffect(() => {
    if (mode !== "stream") {
      setStreamData(null);
      setStreamError(null);
      return;
    }

    setStreamError(null);
    const params = new URLSearchParams({ interval: String(interval) });
    if (interfaceName) params.set("interface", interfaceName);
    const source = new EventSource(`/api/monitoring/stream?${params}`);

    const onSample = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as MonitoringSnapshot;
        setStreamData(payload);
        setStreamError(null);
      } catch {
        setStreamError("Resposta inválida do stream SSE.");
      }
    };

    source.addEventListener("sample", onSample as EventListener);
    source.onerror = () => {
      setStreamError(
        "O stream SSE foi interrompido. Verifique a sessão e a API; use polling se o proxy bloquear streaming.",
      );
      source.close();
    };

    return () => {
      source.removeEventListener("sample", onSample as EventListener);
      source.close();
    };
  }, [mode, interfaceName, interval, streamNonce]);

  const data = mode === "stream" ? streamData : polled.data;
  const error =
    mode === "stream" ? streamError : polled.error;
  const updatedAt =
    mode === "stream" ? (streamData ? new Date() : null) : polled.updatedAt;
  const loading = mode === "stream" ? !streamData && !streamError : polled.loading;
  const refreshing = mode === "stream" ? false : polled.refreshing;

  const refresh = () => {
    if (mode === "stream") {
      setStreamNonce((current) => current + 1);
    } else {
      polled.refresh();
    }
  };

  const rates = data?.rates ?? null;
  const chartPoints = useMemo(
    () => buildChartPoints(data?.history ?? []),
    [data?.history],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rede Wi-Fi"
        title="Monitoramento"
        description="Contadores reais de /sys/class/net. As taxas vêm da diferença entre duas amostras; quando um contador regride, o reset é sinalizado em vez de exibir números falsos."
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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Interface
          <select
            value={interfaceName}
            onChange={(event) => setInterfaceName(event.target.value)}
            className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400/60"
          >
            <option value="">padrão do servidor</option>
            {(interfaces.data?.interfaces ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />

        <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
          {(
            [
              ["polling", "Polling"],
              ["stream", "Tempo real (SSE)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[0.68rem] font-medium transition",
                mode === value
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Intervalo
          <select
            value={interval}
            onChange={(event) => setIntervalSeconds(Number(event.target.value))}
            className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400/60"
          >
            {INTERVALS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <Badge tone={data?.available ? "success" : "warning"} className="ml-auto">
          {data?.interface ?? "—"}
        </Badge>
      </div>

      {error ? <InlineError>{error}</InlineError> : null}
      {data?.reset_detected ? (
        <InlineInfo>
          Um contador regrediu entre as amostras ({formatRelative(data.sampled_at)}).
          Isso indica reset da interface ou reinício do host; as taxas foram
          omitidas nesta janela.
        </InlineInfo>
      ) : null}
      {data && !data.available ? (
        <InlineInfo>
          {data.message ??
            "Os contadores da interface não puderam ser lidos. Verifique se o container usa network_mode: host."}
        </InlineInfo>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recebido agora"
          value={formatBitRate(rates?.rx_bits_per_second)}
          hint={`${formatBytes(data?.counters?.rx_bytes)} acumulados`}
          icon={<ArrowDown className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Enviado agora"
          value={formatBitRate(rates?.tx_bits_per_second)}
          hint={`${formatBytes(data?.counters?.tx_bytes)} acumulados`}
          icon={<ArrowUp className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Pacotes"
          value={formatNumber(data?.counters?.rx_packets)}
          hint={`TX ${formatNumber(data?.counters?.tx_packets)}`}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Estações Wi-Fi"
          value={data?.clients?.wifi_stations ?? "—"}
          hint={
            data?.hotspot
              ? data.hotspot.active
                ? `hotspot ativo (${data.hotspot.connection ?? "—"})`
                : "hotspot inativo"
              : "sem leitura do NetworkManager"
          }
          icon={<Wifi className="h-3.5 w-3.5" />}
        />
      </div>

      <Panel
        title="Tráfego por segundo"
        description="Derivado das amostras persistidas (bits por segundo)."
        action={
          <span className="text-[0.66rem] text-zinc-600">
            janela de {data?.window_seconds ?? 60}s
          </span>
        }
      >
        {loading && !data ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            Coletando amostras…
          </p>
        ) : chartPoints.length < 2 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            Ainda não há amostras suficientes para desenhar o gráfico. Aguarde
            alguns intervalos.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartPoints}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="rxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickFormatter={(value: number) => formatBitRate(value)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0b0f14",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(value, name) => [
                    formatBitRate(Number(value)),
                    name === "rx" ? "Recebido" : "Enviado",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  stroke="#38bdf8"
                  strokeWidth={1.6}
                  fill="url(#rxFill)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  stroke="#34d399"
                  strokeWidth={1.6}
                  fill="url(#txFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Amostragem" description="Origem dos dados e estado da coleta.">
          <dl className="grid grid-cols-2 gap-4">
            <KeyValue
              label="Última amostra"
              value={data?.sampled_at ? formatRelative(data.sampled_at) : "—"}
            />
            <KeyValue
              label="Coletando desde"
              value={
                data?.sampling_since
                  ? formatRelative(data.sampling_since)
                  : "—"
              }
            />
            <KeyValue
              label="Intervalo calculado"
              value={
                rates ? `${rates.interval_seconds.toFixed(2)} s` : "—"
              }
            />
            <KeyValue
              label="Pacotes/s"
              value={
                rates
                  ? `${formatNumber(Math.round(rates.rx_packets_per_second))} ↓ / ${formatNumber(
                      Math.round(rates.tx_packets_per_second),
                    )} ↑`
                  : "—"
              }
            />
          </dl>
        </Panel>

        <Panel
          title="Modo de atualização"
          description="Polling funciona atrás de qualquer proxy; SSE entrega amostras sem repetir requisições."
        >
          <div className="space-y-3 text-xs leading-relaxed text-zinc-400">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-300" />
                Polling
              </span>
              <Badge tone={mode === "polling" ? "success" : "muted"}>
                {mode === "polling" ? "em uso" : "disponível"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
              <span className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-300" />
                SSE
              </span>
              <Badge tone={mode === "stream" ? "success" : "muted"}>
                {mode === "stream" ? "em uso" : "disponível"}
              </Badge>
            </div>
            {streamError && mode === "stream" ? (
              <p className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-red-200">
                <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {streamError}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
