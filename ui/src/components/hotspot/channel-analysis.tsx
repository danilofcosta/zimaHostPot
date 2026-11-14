import { AlertTriangleIcon, CheckIcon, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { Band, WifiChannelAnalysis } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ChannelAnalysisProps {
  band: Band;
  channel: string;
  analysis: WifiChannelAnalysis | null;
  loading: boolean;
  error: string | null;
  onAnalyze: () => void;
  onUseChannel: (channel: number) => void;
}

const BAND_LABEL: Record<Band, string> = {
  bg: "2,4 GHz",
  a: "5 GHz",
};

function barColor(ratio: number): string {
  if (ratio >= 0.75) {
    return "bg-red-400";
  }
  if (ratio >= 0.4) {
    return "bg-amber-400";
  }
  return "bg-emerald-400";
}

export function ChannelAnalysis({
  band,
  channel,
  analysis,
  loading,
  error,
  onAnalyze,
  onUseChannel,
}: ChannelAnalysisProps) {
  const rows = analysis?.channels.filter((row) => row.band === band) ?? [];
  const recommendation =
    analysis?.recommendations.find((item) => item.band === band) ?? null;
  const selected = channel ? Number(channel) : null;
  const maxInterference = Math.max(
    1,
    ...rows.map((row) => row.interference),
  );
  const reason = !analysis
    ? ""
    : recommendation?.interference === 0
      ? `Nenhuma rede sobreposta ao canal ${recommendation.channel}.`
      : analysis.networks === 0
        ? `Nenhuma outra rede detectada na faixa de ${BAND_LABEL[band]}.`
        : `Menos congestionado entre os canais ${rows
            .map((row) => row.channel)
            .join(", ")}.`;

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-zinc-200">
            Análise de canais
          </h3>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-zinc-500">
            Escaneia as redes ao redor e sugere o canal menos congestionado na
            faixa de {BAND_LABEL[band]}.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          onClick={onAnalyze}
          icon={<RefreshIcon className="h-3.5 w-3.5" />}
        >
          Analisar
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-3 space-y-3">
          {recommendation && recommendation.channel !== null ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-200">
                  Canal {recommendation.channel}
                  <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-emerald-400/80">
                    recomendado
                  </span>
                </p>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-zinc-400">
                  {reason}
                </p>
              </div>
              {selected === recommendation.channel ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[0.7rem] font-medium text-emerald-300">
                  <CheckIcon className="h-3.5 w-3.5" />
                  Selecionado
                </span>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onUseChannel(recommendation.channel as number)}
                >
                  Usar canal {recommendation.channel}
                </Button>
              )}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="space-y-2">
              {rows.map((row) => {
                const ratio = row.interference / maxInterference;
                return (
                  <div
                    key={row.channel}
                    className="grid grid-cols-[4.4rem_minmax(0,1fr)_4.2rem] items-center gap-2.5"
                  >
                    <span
                      className={cn(
                        "font-mono text-[0.7rem]",
                        row.recommended ? "text-emerald-300" : "text-zinc-400",
                      )}
                    >
                      Canal {row.channel}
                    </span>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                      title={
                        row.networks > 0
                          ? `${row.networks} rede(s) neste canal · ocupação ${Math.round(row.interference)}`
                          : "Nenhuma rede detectada neste canal"
                      }
                    >
                      <div
                        className={cn("h-full rounded-full", barColor(ratio))}
                        style={{
                          width: `${Math.max(2, Math.round(ratio * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="text-right text-[0.66rem] text-zinc-500">
                      {row.interference === 0
                        ? "livre"
                        : row.interference >= 100
                          ? "100+"
                          : `${Math.round(row.interference)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[0.7rem] text-zinc-500">
              Nenhum canal desta faixa foi analisado.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2 text-[0.66rem] text-zinc-500">
            <span>
              {analysis.networks} rede{analysis.networks === 1 ? "" : "s"}{" "}
              detectada{analysis.networks === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true">·</span>
            <span>scan {formatRelativeTime(analysis.scanned_at)}</span>
            {analysis.scan_mode === "cached" ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-amber-300/90">
                  <AlertTriangleIcon className="h-3 w-3" />
                  em cache (rádio em uso)
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : !loading && !error ? (
        <p className="mt-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-[0.7rem] text-zinc-500">
          Clique em <strong className="font-medium text-zinc-400">Analisar</strong>{" "}
          para escanear as redes próximas. A varredura pode levar alguns
          segundos.
        </p>
      ) : null}
    </section>
  );
}
