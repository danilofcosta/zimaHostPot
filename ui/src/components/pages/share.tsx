"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import {
  Badge,
  EmptyState,
  InlineError,
  PageHeader,
  Panel,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePolledData } from "@/hooks/use-polled-data";
import { HotspotApi } from "@/lib/api";
import { formatClock } from "@/lib/format";
import type { HotspotConfig, HotspotStatus } from "@/lib/types";
import { copyToClipboard } from "@/lib/utils";

const REFRESH_MS = 20_000;

function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,":])/g, "\\$1");
}

export function SharePage() {
  const api = useMemo(() => new HotspotApi(), []);
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"ssid" | "password" | null>(null);

  const loader = useCallback(
    async (signal: AbortSignal) => {
      const config = await api.getConfig(true, signal);
      const status =
        config.profile_name && config.interface
          ? await api
              .getStatus(
                {
                  interfaceName: config.interface,
                  profileName: config.profile_name,
                },
                signal,
              )
              .catch(() => null)
          : null;
      return { config, status };
    },
    [api],
  );

  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<{ config: HotspotConfig; status: HotspotStatus | null }>(
      loader,
      REFRESH_MS,
    );

  const config = data?.config;
  const passwordAvailable = Boolean(config?.password_set && config.password);
  const qrValue =
    config && passwordAvailable
      ? `WIFI:T:WPA;S:${escapeWifiValue(config.name)};P:${escapeWifiValue(
          config.password,
        )};H:false;;`
      : "";

  const copy = async (kind: "ssid" | "password", value: string) => {
    try {
      await copyToClipboard(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
      toast.push({
        tone: "success",
        title: kind === "ssid" ? "SSID copiado" : "Senha copiada",
      });
    } catch {
      toast.push({
        tone: "error",
        title: "Não foi possível copiar",
        description: "Copie manualmente pelo campo exibido.",
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rede Wi-Fi"
        title="Compartilhar Wi-Fi"
        description="QR Code e credenciais da configuração salva. A senha é buscada apenas por esta página autenticada e nunca vai para o bundle do navegador."
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

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel
          title="QR Code"
          description="Aponte a câmera do celular para entrar na rede."
          className="flex flex-col"
        >
          {loading && !data ? (
            <p className="py-16 text-center text-sm text-zinc-500">
              Carregando configuração…
            </p>
          ) : !passwordAvailable ? (
            <EmptyState
              icon={<QrCode className="h-5 w-5" />}
              title="Nenhuma senha salva"
              description="Salve o SSID e a senha na página Hotspot para gerar o QR Code."
              action={
                <Link href="/hotspot">
                  <Button variant="primary" size="sm">
                    Configurar hotspot
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-[0_20px_60px_-25px_rgba(52,211,153,0.5)]">
                <QRCodeSVG
                  value={qrValue}
                  size={216}
                  bgColor="#ffffff"
                  fgColor="#06080c"
                  level="M"
                  marginSize={1}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge tone={data?.status?.active ? "success" : "muted"}>
                  {data?.status?.active ? (
                    <>
                      <Wifi className="h-3 w-3" /> hotspot ativo
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" /> hotspot desligado
                    </>
                  )}
                </Badge>
                <Badge tone="neutral">{config?.band === "bg" ? "2,4 GHz" : "5 GHz"}</Badge>
              </div>
              <p className="max-w-xs text-center text-[0.68rem] leading-relaxed text-zinc-500">
                O QR Code contém o SSID e a senha em texto claro. Exiba apenas
                para pessoas autorizadas.
              </p>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Credenciais" description="Configuração salva no servidor.">
            {config ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Nome da rede (SSID)
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 font-mono text-sm text-zinc-100">
                      {config.name || "—"}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!config.name}
                      onClick={() => void copy("ssid", config.name)}
                      icon={
                        copied === "ssid" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {copied === "ssid" ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Senha
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 font-mono text-sm text-zinc-100">
                      {passwordAvailable
                        ? revealed
                          ? config.password
                          : "•".repeat(Math.min(config.password.length, 32))
                        : "não definida"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!passwordAvailable}
                      onClick={() => setRevealed((current) => !current)}
                      icon={
                        revealed ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {revealed ? "Ocultar" : "Mostrar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!passwordAvailable}
                      onClick={() => void copy("password", config.password)}
                      icon={
                        copied === "password" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {copied === "password" ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 text-xs">
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.14em] text-zinc-500">
                      Interface
                    </dt>
                    <dd className="mt-1 font-mono text-zinc-300">
                      {config.interface}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.14em] text-zinc-500">
                      Perfil
                    </dt>
                    <dd className="mt-1 font-mono text-zinc-300">
                      {config.profile_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.14em] text-zinc-500">
                      Endereço IP
                    </dt>
                    <dd className="mt-1 font-mono text-zinc-300">
                      {data?.status?.ip_address ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.14em] text-zinc-500">
                      Estado
                    </dt>
                    <dd className="mt-1 text-zinc-300">
                      {data?.status?.active ? "ativo" : "desligado"}
                    </dd>
                  </div>
                </dl>

                <Link href="/hotspot" className="block">
                  <Button variant="secondary" block>
                    Alterar configuração
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Sem configuração carregada.</p>
            )}
          </Panel>

          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-xs leading-relaxed text-emerald-100/80">
              A senha só é retornada para esta sessão autenticada, via BFF. Ela
              não aparece em logs nem no HTML estático. Troque a senha inicial
              da conta antes de compartilhar o painel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
