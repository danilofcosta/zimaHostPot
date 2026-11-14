"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  Laptop,
  MonitorSmartphone,
  Pencil,
  Printer,
  Radio,
  RefreshCw,
  Search,
  ShieldOff,
  Smartphone,
  Tablet,
  Tv,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  Badge,
  EmptyState,
  InlineError,
  PageHeader,
  Panel,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action";
import { Field, inputClass } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { usePolledData } from "@/hooks/use-polled-data";
import { HotspotApi } from "@/lib/api";
import {
  deviceStateLabel,
  deviceTypeLabel,
  formatClock,
  formatSignal,
  formatRelative,
} from "@/lib/format";
import type {
  ConnectedClient,
  ConnectedDevicesResponse,
  DeviceType,
} from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

const POLL_MS = 8_000;

type PendingKind = "disconnect" | "block" | "unblock" | "ban" | "unban";

interface PendingAction {
  kind: PendingKind;
  client: ConnectedClient;
}

const DEVICE_TYPES: DeviceType[] = [
  "unknown",
  "phone",
  "tablet",
  "computer",
  "tv",
  "iot",
  "network",
  "printer",
  "other",
];

function DeviceIcon({ type }: { type: DeviceType }) {
  const className = "h-4 w-4";
  switch (type) {
    case "phone":
      return <Smartphone className={className} />;
    case "tablet":
      return <Tablet className={className} />;
    case "computer":
      return <Laptop className={className} />;
    case "tv":
      return <Tv className={className} />;
    case "printer":
      return <Printer className={className} />;
    case "network":
      return <Radio className={className} />;
    default:
      return <MonitorSmartphone className={className} />;
  }
}

const STATE_TONE = {
  associated: "success",
  active: "info",
  dhcp_only: "warning",
  inactive: "muted",
  disconnected: "muted",
} as const;

const ACTION_TEXT: Record<
  PendingKind,
  { title: string; confirm: string; description: string }
> = {
  disconnect: {
    title: "Desconectar dispositivo?",
    confirm: "Desconectar",
    description:
      "O dispositivo será removido da rede Wi-Fi com `iw station del`. Ele pode reconectar automaticamente; para impedir, use Banir.",
  },
  block: {
    title: "Bloquear internet?",
    confirm: "Bloquear internet",
    description:
      "O tráfego roteado para a internet será bloqueado via nftables. O dispositivo continua associado ao Wi-Fi e pode acessar a rede local.",
  },
  unblock: {
    title: "Liberar internet?",
    confirm: "Liberar internet",
    description:
      "A regra de bloqueio será removida da tabela nftables. Se o dispositivo também estiver banido, use Desbanir.",
  },
  ban: {
    title: "Banir dispositivo?",
    confirm: "Banir",
    description:
      "O MAC será bloqueado na internet e o dispositivo será desconectado do Wi-Fi. O bloqueio permanece até você desbanir.",
  },
  unban: {
    title: "Desbanir dispositivo?",
    confirm: "Desbanir",
    description:
      "O bloqueio de internet será removido e o dispositivo poderá reconectar ao Wi-Fi.",
  },
};

export function ConnectedDevicesPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const toast = useToast();

  const [interfaceName, setInterfaceName] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ConnectedClient | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);

  const loader = useCallback(
    (signal: AbortSignal) =>
      api.connectedDevices(interfaceName || undefined, signal),
    [api, interfaceName],
  );

  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<ConnectedDevicesResponse>(loader, POLL_MS, interfaceName);

  const clients = (data?.clients ?? []).filter((client) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return [client.mac, client.ip, client.hostname, client.flags.nickname, client.vendor]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  const counts = data?.counts ?? {};
  const capabilities = data?.capabilities;

  const runAction = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      switch (pending.kind) {
        case "disconnect":
          await api.disconnectDevice(pending.client.mac);
          toast.push({
            tone: "success",
            title: "Dispositivo desconectado",
            description: pending.client.mac,
          });
          break;
        case "block":
          await api.blockInternet(pending.client.mac, true);
          toast.push({
            tone: "success",
            title: "Internet bloqueada",
            description: pending.client.mac,
          });
          break;
        case "unblock":
          await api.blockInternet(pending.client.mac, false);
          toast.push({
            tone: "success",
            title: "Internet liberada",
            description: pending.client.mac,
          });
          break;
        case "ban":
          await api.banDevice(pending.client.mac, true);
          toast.push({
            tone: "success",
            title: "Dispositivo banido",
            description: pending.client.mac,
          });
          break;
        case "unban":
          await api.banDevice(pending.client.mac, false);
          toast.push({
            tone: "success",
            title: "Dispositivo desbanido",
            description: pending.client.mac,
          });
          break;
      }
      setPending(null);
      refresh();
    } catch (actionError) {
      toast.push({
        tone: "error",
        title: "Ação não aplicada",
        description: describeError(actionError),
      });
    } finally {
      setWorking(false);
    }
  };

  const pendingInfo = pending ? ACTION_TEXT[pending.kind] : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rede Wi-Fi"
        title="Dispositivos conectados"
        description="Visão em tempo real do que foi observado via iw, ARP e leases DHCP. Nenhum dispositivo é inventado: cada linha veio de uma dessas fontes."
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
        {(
          [
            ["associated", "Associados"],
            ["active", "Ativos (ARP)"],
            ["dhcp_only", "Só DHCP"],
            ["inactive", "Inativos"],
          ] as const
        ).map(([key, label]) => (
          <div
            key={key}
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3"
          >
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {counts[key] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por MAC, IP, hostname ou fabricante"
              className={cn(inputClass, "h-9 pl-9 text-xs")}
            />
          </div>
          {data?.interfaces && data.interfaces.length > 0 ? (
            <select
              value={interfaceName}
              onChange={(event) => setInterfaceName(event.target.value)}
              className={cn(inputClass, "h-9 w-auto min-w-[9rem] text-xs")}
              aria-label="Interface"
            >
              <option value="">Todas as interfaces</option>
              {data.interfaces.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {loading && !data ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            Coletando dispositivos…
          </div>
        ) : clients.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<WifiOff className="h-5 w-5" />}
              title={
                search
                  ? "Nenhum dispositivo corresponde à busca"
                  : "Nenhum dispositivo observado agora"
              }
              description={
                search
                  ? "Limpe a busca ou troque a interface selecionada."
                  : "Assim que um dispositivo se associar ao Wi-Fi, tiver um vizinho ARP ativo ou um lease DHCP, ele aparece aqui."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {clients.map((client) => {
              const blocked = Boolean(client.flags.internet_blocked);
              const banned = Boolean(client.flags.banned);
              return (
                <li
                  key={client.mac}
                  className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                      <DeviceIcon type={client.device_type} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {client.flags.nickname ||
                            client.hostname ||
                            client.mac}
                        </p>
                        {client.flags.is_known ? (
                          <Badge tone="info">conhecido</Badge>
                        ) : null}
                        {blocked ? <Badge tone="warning">internet bloqueada</Badge> : null}
                        {banned ? <Badge tone="danger">banido</Badge> : null}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[0.66rem] text-zinc-500">
                        {client.mac}
                        {client.ip ? ` · ${client.ip}` : ""}
                        {client.interface ? ` · ${client.interface}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.64rem] text-zinc-500">
                        <Badge tone={STATE_TONE[client.state]}>
                          {deviceStateLabel(client.state)}
                        </Badge>
                        <span>{deviceTypeLabel(client.device_type)}</span>
                        {client.vendor ? <span>· {client.vendor}</span> : null}
                        {client.signal_dbm !== null ? (
                          <span>· {formatSignal(client.signal_dbm)}</span>
                        ) : null}
                        {client.last_seen ? (
                          <span>· visto {formatRelative(client.last_seen)}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {client.sources.map((source) => (
                          <span
                            key={source}
                            className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-wide text-zinc-500"
                          >
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(client)}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={blocked ? "secondary" : "ghost"}
                      disabled={!capabilities?.internet_block}
                      title={
                        capabilities?.internet_block
                          ? undefined
                          : "nftables indisponível neste host"
                      }
                      onClick={() =>
                        setPending({
                          kind: blocked ? "unblock" : "block",
                          client,
                        })
                      }
                      icon={<ShieldOff className="h-3.5 w-3.5" />}
                    >
                      {blocked ? "Liberar" : "Bloquear"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        !capabilities?.wifi_disconnect ||
                        client.state !== "associated"
                      }
                      title={
                        !capabilities?.wifi_disconnect
                          ? "iw indisponível ou sem interface Wi-Fi"
                          : client.state !== "associated"
                            ? "O dispositivo não está associado ao Wi-Fi"
                            : undefined
                      }
                      onClick={() => setPending({ kind: "disconnect", client })}
                      icon={<Unplug className="h-3.5 w-3.5" />}
                    >
                      Desconectar
                    </Button>
                    <Button
                      size="sm"
                      variant={banned ? "secondary" : "danger"}
                      disabled={!capabilities?.internet_block && !banned}
                      onClick={() =>
                        setPending({ kind: banned ? "unban" : "ban", client })
                      }
                      icon={<Ban className="h-3.5 w-3.5" />}
                    >
                      {banned ? "Desbanir" : "Banir"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.66rem] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3" /> associado = estação no `iw station dump`
        </span>
        <span className="flex items-center gap-1.5">
          <Radio className="h-3 w-3" /> ativo = vizinho ARP/NDP
        </span>
        <span className="flex items-center gap-1.5">
          <MonitorSmartphone className="h-3 w-3" /> dhcp = apenas lease DHCP
        </span>
      </div>

      <EditDeviceModal
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      <ConfirmActionDialog
        open={pending !== null}
        title={pendingInfo?.title ?? ""}
        description={pendingInfo?.description ?? ""}
        confirmLabel={pendingInfo?.confirm ?? "Confirmar"}
        loading={working}
        onConfirm={() => void runAction()}
        onClose={() => setPending(null)}
      >
        <p>
          Dispositivo:{" "}
          <span className="font-mono text-zinc-100">
            {pending?.client.mac}
          </span>
          {pending?.client.ip ? ` (${pending.client.ip})` : ""}
        </p>
      </ConfirmActionDialog>
    </div>
  );
}

function EditDeviceModal({
  client,
  onClose,
  onSaved,
}: {
  client: ConnectedClient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useMemo(() => new HotspotApi(), []);
  const toast = useToast();
  const [nickname, setNickname] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("unknown");
  const [notes, setNotes] = useState("");
  const [isKnown, setIsKnown] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = client !== null;
  const currentKey = client?.mac ?? "";

  const reset = useCallback(() => {
    if (!client) return;
    setNickname(client.flags.nickname ?? "");
    setDeviceType(client.device_type);
    setNotes(client.flags.notes ?? "");
    setIsKnown(Boolean(client.flags.is_known));
    setError(null);
  }, [client]);

  // Reset the form when a different device is opened.
  useEffect(() => {
    reset();
  }, [reset, currentKey]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    setPending(true);
    setError(null);
    try {
      await api.updateDevice(client.mac, {
        nickname: nickname.trim() || null,
        device_type: deviceType,
        notes: notes.trim() || null,
        is_known: isKnown,
      });
      toast.push({
        tone: "success",
        title: "Dispositivo atualizado",
        description: client.mac,
      });
      onSaved();
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar dispositivo"
      description={client ? `${client.mac}${client.ip ? ` · ${client.ip}` : ""}` : ""}
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <Field label="Apelido" htmlFor="nickname">
          <input
            id="nickname"
            className={inputClass}
            value={nickname}
            maxLength={64}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Ex.: TV da sala"
            disabled={pending}
          />
        </Field>
        <Field label="Tipo" htmlFor="device-type">
          <select
            id="device-type"
            className={inputClass}
            value={deviceType}
            onChange={(event) => setDeviceType(event.target.value as DeviceType)}
            disabled={pending}
          >
            {DEVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {deviceTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observações" htmlFor="notes">
          <textarea
            id="notes"
            className={cn(inputClass, "h-24 resize-none py-2.5")}
            value={notes}
            maxLength={500}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anotações internas sobre este dispositivo"
            disabled={pending}
          />
        </Field>
        <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={isKnown}
            onChange={(event) => setIsKnown(event.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-white/20 bg-black/30 accent-emerald-400"
          />
          Marcar como dispositivo conhecido
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
