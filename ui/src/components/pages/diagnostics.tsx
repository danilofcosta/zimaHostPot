"use client";

import { useCallback, useMemo } from "react";
import {
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  RefreshCw,
  Stethoscope,
  TriangleExclamationPoint,
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
import { formatBytes, formatClock } from "@/lib/format";
import type { CheckStatus, DiagnosticsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  CheckStatus,
  { label: string; tone: "success" | "warning" | "danger" | "muted"; icon: typeof CircleCheck }
> = {
  ok: { label: "OK", tone: "success", icon: CircleCheck },
  warn: { label: "Atenção", tone: "warning", icon: TriangleExclamationPoint },
  error: { label: "Erro", tone: "danger", icon: CircleX },
  unsupported: { label: "Não suportado", tone: "muted", icon: CircleQuestionMark },
};

export function DiagnosticsPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const loader = useCallback(
    (signal: AbortSignal) => api.diagnostics(signal),
    [api],
  );
  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<DiagnosticsResponse>(loader, 30_000);

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistema"
        title="Diagnóstico"
        description="Cada verificação reporta o que foi realmente observado no host. “Não suportado” significa ferramenta ou permissão ausente, não que está tudo bem."
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
              Executar novamente
            </Button>
          </>
        }
      />

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="OK"
          value={summary?.ok ?? "—"}
          tone="success"
          icon={<CircleCheck className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Atenção"
          value={summary?.warn ?? "—"}
          tone="warning"
          icon={<TriangleExclamationPoint className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Erros"
          value={summary?.error ?? "—"}
          tone="danger"
          icon={<CircleX className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Não suportado"
          value={summary?.unsupported ?? "—"}
          icon={<CircleQuestionMark className="h-3.5 w-3.5" />}
        />
      </div>

      <Panel
        title="Verificações"
        description="Resultado real de ferramentas, sockets, banco e firewall."
        bodyClassName="p-0"
      >
        {loading && !data ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">
            Executando diagnóstico…
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {(data?.checks ?? []).map((check) => {
              const meta = STATUS_META[check.status] ?? STATUS_META.unsupported;
              const Icon = meta.icon;
              return (
                <li
                  key={check.id}
                  className="flex items-start gap-3 px-4 py-3.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      check.status === "ok"
                        ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                        : check.status === "warn"
                          ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-300"
                          : check.status === "error"
                            ? "border-red-400/20 bg-red-400/[0.08] text-red-300"
                            : "border-white/10 bg-white/[0.03] text-zinc-500",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-zinc-100">
                        {check.label}
                      </p>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-mono text-[0.6rem] text-zinc-600">
                        {check.id}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-xs leading-relaxed text-zinc-400">
                      {check.detail}
                    </p>
                    {check.hint ? (
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-zinc-500">
                        <span className="text-zinc-400">Sugestão:</span>{" "}
                        {check.hint}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Banco SQLite" description="Estado do arquivo compartilhado entre Node e Python.">
        {data?.database ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KeyValue label="Caminho" value={data.database.path} mono />
            <KeyValue
              label="Existente"
              value={data.database.exists ? "sim" : "não"}
            />
            <KeyValue
              label="Tamanho"
              value={formatBytes(data.database.size_bytes)}
            />
            <KeyValue label="WAL" value={formatBytes(data.database.wal_size_bytes)} />
            <KeyValue label="Journal" value={data.database.journal_mode ?? "—"} />
            <KeyValue label="Integridade" value={data.database.integrity ?? "—"} />
            <KeyValue label="SQLite" value={data.database.sqlite_version} mono />
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">Sem dados do banco.</p>
        )}
      </Panel>

      <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.68rem] text-zinc-500">
        <Stethoscope className="h-3.5 w-3.5 shrink-0" />
        Algumas verificações só fazem sentido no host Linux com NetworkManager,
        D-Bus e nftables disponíveis. No Windows, elas aparecem como “não
        suportado”.
      </div>
    </div>
  );
}
