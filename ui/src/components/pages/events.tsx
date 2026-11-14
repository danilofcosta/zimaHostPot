"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import {
  Badge,
  EmptyState,
  InlineError,
  PageHeader,
  Panel,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePolledData } from "@/hooks/use-polled-data";
import { HotspotApi } from "@/lib/api";
import {
  eventTypeLabel,
  formatClock,
  formatDateTime,
  formatRelative,
  severityLabel,
} from "@/lib/format";
import type { EventsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const POLL_MS = 15_000;

const SEVERITIES = ["info", "success", "warning", "error"] as const;
const WINDOWS = [
  { value: "", label: "Todo o período" },
  { value: "1", label: "Última hora" },
  { value: "24", label: "Últimas 24 h" },
  { value: "168", label: "Últimos 7 dias" },
  { value: "720", label: "Últimos 30 dias" },
];

const SEVERITY_TONE = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "danger",
} as const;

export function EventsPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [sinceHours, setSinceHours] = useState("24");
  const [offset, setOffset] = useState(0);

  const countsLoader = useCallback(
    (signal: AbortSignal) => api.eventCounts(24, signal),
    [api],
  );
  const counts = usePolledData(countsLoader, 60_000);

  const severityLoader = useCallback(
    async (signal: AbortSignal) => {
      const totals = await Promise.all(
        SEVERITIES.map((value) =>
          api
            .events({ limit: 1, severity: value, sinceHours: 24 }, signal)
            .then((response) => response.total)
            .catch(() => null),
        ),
      );
      return Object.fromEntries(
        SEVERITIES.map((value, index) => [value, totals[index]]),
      ) as Record<(typeof SEVERITIES)[number], number | null>;
    },
    [api],
  );
  const severityCounts = usePolledData(severityLoader, 60_000);

  const loader = useCallback(
    (signal: AbortSignal) =>
      api.events(
        {
          limit: PAGE_SIZE,
          offset,
          severity: severity || undefined,
          eventType: eventType || undefined,
          sinceHours: sinceHours ? Number(sinceHours) : undefined,
        },
        signal,
      ),
    [api, severity, eventType, sinceHours, offset],
  );

  const key = `${severity}|${eventType}|${sinceHours}|${offset}`;
  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<EventsResponse>(loader, POLL_MS, key);

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const typeOptions = Object.keys(counts.data?.counts ?? {}).sort();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operação"
        title="Eventos"
        description="Registro persistido no SQLite: conexões, desconexões, bloqueios, banimentos e alterações administrativas."
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

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {SEVERITIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setOffset(0);
              setSeverity((current) => (current === value ? "" : value));
            }}
            className={cn(
              "rounded-xl border px-3.5 py-3 text-left transition",
              severity === value
                ? "border-emerald-400/30 bg-emerald-400/[0.08]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/20",
            )}
          >
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {severityLabel(value)}
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {severityCounts.data?.[value] ?? "—"}
            </p>
            <p className="mt-0.5 text-[0.6rem] text-zinc-600">
              últimas 24 h{severity === value ? " · filtro ativo" : ""}
            </p>
          </button>
        ))}
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <select
            value={eventType}
            onChange={(event) => {
              setOffset(0);
              setEventType(event.target.value);
            }}
            className="h-9 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-400/60"
            aria-label="Tipo de evento"
          >
            <option value="">Todos os tipos</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            value={sinceHours}
            onChange={(event) => {
              setOffset(0);
              setSinceHours(event.target.value);
            }}
            className="h-9 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-400/60"
            aria-label="Período"
          >
            {WINDOWS.map((window) => (
              <option key={window.value} value={window.value}>
                {window.label}
              </option>
            ))}
          </select>
          {severity || eventType || sinceHours !== "24" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSeverity("");
                setEventType("");
                setSinceHours("24");
                setOffset(0);
              }}
            >
              Limpar filtros
            </Button>
          ) : null}
          <span className="ml-auto text-[0.66rem] text-zinc-600">
            {counts.data
              ? `${Object.keys(counts.data.counts).length} tipo(s) nas últimas 24 h`
              : "contagens indisponíveis"}
          </span>
        </div>

        {loading && !data ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            Carregando eventos…
          </div>
        ) : events.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell className="h-5 w-5" />}
              title="Nenhum evento encontrado"
              description="Ajuste o período ou os filtros. Eventos só aparecem depois de uma coleta ou ação real."
            />
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
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
                  <p className="text-sm text-zinc-200">{event.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.64rem] text-zinc-500">
                    <Badge tone={SEVERITY_TONE[event.severity as keyof typeof SEVERITY_TONE] ?? "neutral"}>
                      {severityLabel(event.severity)}
                    </Badge>
                    <span>{eventTypeLabel(event.type)}</span>
                    {event.mac ? (
                      <span className="font-mono">{event.mac}</span>
                    ) : null}
                    {event.ip ? <span className="font-mono">{event.ip}</span> : null}
                    {event.interface ? <span>{event.interface}</span> : null}
                    <span>{formatDateTime(event.created_at)}</span>
                    <span>{formatRelative(event.created_at)}</span>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[0.62rem] text-zinc-600 hover:text-zinc-400">
                        metadados
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-2 font-mono text-[0.6rem] text-zinc-400">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
          <span>
            {total} evento(s) · página {page} de {pageCount}
          </span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              icon={<ChevronLeft className="h-3.5 w-3.5" />}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              icon={<ChevronRight className="h-3.5 w-3.5" />}
            >
              Próxima
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
