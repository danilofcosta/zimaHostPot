"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  QrCodeIcon,
} from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import type { HotspotCreateResult } from "@/lib/types";
import {
  CARD_CLASS,
  cn,
  copyToClipboard,
  formatDateTime,
} from "@/lib/utils";

interface ConnectionDetailsProps {
  created: HotspotCreateResult | null;
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      toast.push({ tone: "info", title: `${label} copiado` });
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.push({
        tone: "error",
        title: "Não foi possível copiar",
        description: "Copie o valor manualmente.",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
      title={`Copiar ${label.toLowerCase()}`}
      aria-label={`Copiar ${label.toLowerCase()}`}
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-emerald-300" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function DataItem({
  label,
  value,
  copyValue,
  mono = true,
}: {
  label: string;
  value: string;
  copyValue?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.63rem] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        <p
          className={cn(
            "min-w-0 truncate text-sm text-zinc-200",
            mono && "font-mono",
          )}
          title={value}
        >
          {value}
        </p>
        {copyValue ? <CopyButton label={label} value={copyValue} /> : null}
      </div>
    </div>
  );
}

export function ConnectionDetails({ created }: ConnectionDetailsProps) {
  const [showPassword, setShowPassword] = useState(false);

  if (!created) {
    return (
      <section className={cn(CARD_CLASS, "p-5 sm:p-6")}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
            <QrCodeIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Detalhes e QR Code
            </h2>
            <p className="text-xs text-zinc-500">
              Aparecem aqui após criar um hotspot.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <QrCodeIcon className="h-7 w-7 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-300">
            Nenhum hotspot criado nesta sessão
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
            Preencha o formulário ao lado para gerar a rede, a senha e o QR Code
            de conexão.
          </p>
        </div>
      </section>
    );
  }

  const { network, interface_details: iface } = created;

  return (
    <section className={cn(CARD_CLASS, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <QrCodeIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Hotspot criado
            </h2>
            <p className="text-xs text-zinc-500">
              {formatDateTime(created.created_at)}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-300">
          {created.status}
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-[0_20px_60px_-25px_rgba(16,185,129,0.5)]">
          <QRCodeSVG
            value={network.qr_code_string}
            size={132}
            level="M"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#07110c"
            title="QR Code para conectar ao hotspot"
          />
        </div>

        <div className="min-w-0 space-y-3.5">
          <DataItem
            label="SSID"
            value={network.ssid}
            copyValue={network.ssid}
            mono={false}
          />

          <div className="min-w-0">
            <p className="text-[0.63rem] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Senha
            </p>
            <div className="mt-0.5 flex items-center gap-1">
              <p className="min-w-0 truncate font-mono text-sm text-zinc-200">
                {showPassword ? network.password : "••••••••••••"}
              </p>
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOffIcon className="h-3.5 w-3.5" />
                ) : (
                  <EyeIcon className="h-3.5 w-3.5" />
                )}
              </button>
              <CopyButton label="Senha" value={network.password} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DataItem label="Segurança" value={network.security} />
            <DataItem
              label="Banda / canal"
              value={`${network.band ?? "auto"} · ${network.channel}`}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.06] pt-5 sm:grid-cols-4">
        <DataItem label="IP" value={iface.ipv4_cidr} copyValue={iface.ipv4_cidr} />
        <DataItem label="Gateway" value={iface.gateway} />
        <DataItem label="MAC" value={iface.mac_address} />
        <DataItem label="DHCP" value={iface.dhcp_range} mono={false} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-2.5">
        <p className="text-[0.7rem] text-zinc-500">
          Payload do QR Code para integrar com outros apps.
        </p>
        <CopyButton label="Payload do QR Code" value={network.qr_code_string} />
      </div>
    </section>
  );
}
