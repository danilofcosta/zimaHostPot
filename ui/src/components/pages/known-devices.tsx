"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  RefreshCw,
  Search,
  ShieldOff,
  Users,
} from "lucide-react";

import {
  Badge,
  EmptyState,
  InlineError,
  KeyValue,
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
  formatDateTime,
  formatRelative,
} from "@/lib/format";
import type {
  DeviceDetails,
  DeviceType,
  KnownDevice,
  KnownDevicesResponse,
} from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

const PAGE_SIZE = 50;
const POLL_MS = 30_000;

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

type PendingKind = "block" | "unblock" | "ban" | "unban";

export function KnownDevicesPage() {
  const api = useMemo(() => new HotspotApi(), []);
  const toast = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [offset, setOffset] = useState(0);

  const [detailsMac, setDetailsMac] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    kind: PendingKind;
    device: KnownDevice;
  } | null>(null);
  const [working, setWorking] = useState(false);

  const loader = useCallback(
    (signal: AbortSignal) =>
      api.knownDevices(
        {
          search: search || undefined,
          deviceType: deviceType || undefined,
          onlyBlocked,
          limit: PAGE_SIZE,
          offset,
        },
        signal,
      ),
    [api, search, deviceType, onlyBlocked, offset],
  );

  const key = `${search}|${deviceType}|${onlyBlocked}|${offset}`;
  const { data, error, loading, refreshing, updatedAt, refresh } =
    usePolledData<KnownDevicesResponse>(loader, POLL_MS, key);

  const devices = data?.devices ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const pendingInfo = pending
    ? pending.kind === "block"
      ? {
          title: "Bloquear internet?",
          confirm: "Bloquear",
          description:
            "Adiciona o MAC na tabela nftables dedicada. O dispositivo continua no Wi-Fi, mas perde acesso roteado à internet.",
        }
      : pending.kind === "unblock"
        ? {
            title: "Liberar internet?",
            confirm: "Liberar",
            description:
              "Remove a regra de bloqueio de internet da tabela nftables.",
          }
        : pending.kind === "ban"
          ? {
              title: "Banir dispositivo?",
              confirm: "Banir",
              description:
                "Bloqueia a internet no nftables e tenta desconectar a estação do Wi-Fi. Permanece até você desbanir.",
            }
          : {
              title: "Desbanir dispositivo?",
              confirm: "Desbanir",
              description:
                "Remove o bloqueio de internet e limpa as flags de banimento.",
            }
    : null;

  const runAction = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      if (pending.kind === "block" || pending.kind === "unblock") {
        await api.blockInternet(pending.device.mac, pending.kind === "block");
      } else {
        await api.banDevice(pending.device.mac, pending.kind === "ban");
      }
      toast.push({
        tone: "success",
        title: "Ação aplicada",
        description: `${pending.device.mac} · ${pendingInfo?.confirm ?? ""}`,
      });
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rede Wi-Fi"
        title="Dispositivos conhecidos"
        description="Histórico persistido no SQLite: renomeie, classifique, bloqueie a internet ou banir. O tipo de bloqueio fica sempre explícito."
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

      <Panel bodyClassName="p-0">
        <form
          onSubmit={submitSearch}
          className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por MAC, apelido, hostname ou fabricante"
              className={cn(inputClass, "h-9 pl-9 text-xs")}
            />
          </div>
          <select
            value={deviceType}
            onChange={(event) => {
              setOffset(0);
              setDeviceType(event.target.value);
            }}
            className={cn(inputClass, "h-9 w-auto min-w-[9rem] text-xs")}
            aria-label="Tipo de dispositivo"
          >
            <option value="">Todos os tipos</option>
            {DEVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {deviceTypeLabel(type)}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={onlyBlocked}
              onChange={(event) => {
                setOffset(0);
                setOnlyBlocked(event.target.checked);
              }}
              className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-emerald-400"
            />
            Só bloqueados
          </label>
          <Button size="sm" type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {loading && !data ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            Carregando histórico…
          </div>
        ) : devices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={
                total === 0 && !search && !deviceType && !onlyBlocked
                  ? "Nenhum dispositivo no histórico"
                  : "Nenhum dispositivo corresponde aos filtros"
              }
              description="O histórico é preenchido automaticamente pela coleta de rede. Nada é inventado."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[0.6rem] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-4 py-2.5 font-semibold">Dispositivo</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Último IP</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 font-semibold">Visto</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {devices.map((device) => (
                  <tr
                    key={device.id}
                    className="transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-zinc-100">
                          {device.nickname || device.hostname || device.mac}
                        </span>
                        {device.is_known ? (
                          <Badge tone="info">conhecido</Badge>
                        ) : null}
                        {device.internet_blocked ? (
                          <Badge tone="warning">internet off</Badge>
                        ) : null}
                        {device.banned ? <Badge tone="danger">banido</Badge> : null}
                      </div>
                      <p className="mt-0.5 font-mono text-[0.64rem] text-zinc-500">
                        {device.mac}
                        {device.vendor ? ` · ${device.vendor}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {deviceTypeLabel(device.device_type)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.68rem] text-zinc-400">
                      {device.last_ip ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge tone={device.is_online ? "success" : "muted"}>
                          {device.is_online ? "online" : "offline"}
                        </Badge>
                        <span className="text-[0.62rem] text-zinc-500">
                          {deviceStateLabel(device.last_state)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[0.68rem] text-zinc-400">
                      {formatRelative(device.last_seen)}
                      <span className="block text-[0.6rem] text-zinc-600">
                        desde {formatRelative(device.first_seen)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailsMac(device.mac)}
                          icon={<Eye className="h-3.5 w-3.5" />}
                        >
                          Detalhes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!device.is_online}
                          onClick={() => setDetailsMac(device.mac)}
                          icon={<Pencil className="h-3.5 w-3.5" />}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant={device.internet_blocked ? "secondary" : "ghost"}
                          onClick={() =>
                            setPending({
                              kind: device.internet_blocked ? "unblock" : "block",
                              device,
                            })
                          }
                          icon={<ShieldOff className="h-3.5 w-3.5" />}
                        >
                          {device.internet_blocked ? "Liberar" : "Bloquear"}
                        </Button>
                        <Button
                          size="sm"
                          variant={device.banned ? "secondary" : "danger"}
                          onClick={() =>
                            setPending({
                              kind: device.banned ? "unban" : "ban",
                              device,
                            })
                          }
                          icon={<Ban className="h-3.5 w-3.5" />}
                        >
                          {device.banned ? "Desbanir" : "Banir"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
          <span>
            {total} dispositivo(s) · página {page} de {pageCount}
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

      <DeviceDetailsModal
        mac={detailsMac}
        onClose={() => setDetailsMac(null)}
        onChanged={() => refresh()}
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
          <span className="font-mono text-zinc-100">{pending?.device.mac}</span>
        </p>
      </ConfirmActionDialog>
    </div>
  );
}

function DeviceDetailsModal({
  mac,
  onClose,
  onChanged,
}: {
  mac: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const api = useMemo(() => new HotspotApi(), []);
  const toast = useToast();
  const [details, setDetails] = useState<DeviceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("unknown");
  const [notes, setNotes] = useState("");
  const [isKnown, setIsKnown] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!mac) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.device(mac, signal);
        setDetails(result);
        setNickname(result.nickname ?? "");
        setDeviceType(result.device_type);
        setNotes(result.notes ?? "");
        setIsKnown(result.is_known);
      } catch (loadError) {
        if (!signal?.aborted) {
          setError(describeError(loadError));
        }
      } finally {
        setLoading(false);
      }
    },
    [api, mac],
  );

  useEffect(() => {
    if (!mac) {
      setDetails(null);
      setEditing(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, mac]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!mac) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateDevice(mac, {
        nickname: nickname.trim() || null,
        device_type: deviceType,
        notes: notes.trim() || null,
        is_known: isKnown,
      });
      setDetails(updated);
      setEditing(false);
      onChanged();
      toast.push({
        tone: "success",
        title: "Dispositivo atualizado",
        description: mac,
      });
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={mac !== null}
      onClose={onClose}
      title="Detalhes do dispositivo"
      description={mac ?? ""}
      className="max-w-3xl"
    >
      {error ? <InlineError>{error}</InlineError> : null}
      {loading && !details ? (
        <p className="py-8 text-center text-sm text-zinc-500">Carregando…</p>
      ) : details ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-white">
                {details.nickname || details.hostname || details.mac}
              </p>
              <p className="font-mono text-[0.7rem] text-zinc-500">
                {details.mac}
                {details.vendor ? ` · ${details.vendor}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{deviceTypeLabel(details.device_type)}</Badge>
                {details.is_known ? <Badge tone="info">conhecido</Badge> : null}
                {details.internet_blocked ? (
                  <Badge tone="warning">internet bloqueada</Badge>
                ) : null}
                {details.banned ? <Badge tone="danger">banido</Badge> : null}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing((current) => !current)}
              icon={<Pencil className="h-3.5 w-3.5" />}
            >
              {editing ? "Fechar edição" : "Editar"}
            </Button>
          </div>

          {editing ? (
            <form
              onSubmit={save}
              className="space-y-3 rounded-xl border border-white/[0.08] bg-black/20 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Apelido" htmlFor="detail-nickname">
                  <input
                    id="detail-nickname"
                    className={inputClass}
                    value={nickname}
                    maxLength={64}
                    onChange={(event) => setNickname(event.target.value)}
                    disabled={saving}
                  />
                </Field>
                <Field label="Tipo" htmlFor="detail-type">
                  <select
                    id="detail-type"
                    className={inputClass}
                    value={deviceType}
                    onChange={(event) =>
                      setDeviceType(event.target.value as DeviceType)
                    }
                    disabled={saving}
                  >
                    {DEVICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {deviceTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Observações" htmlFor="detail-notes">
                <textarea
                  id="detail-notes"
                  className={cn(inputClass, "h-20 resize-none py-2.5")}
                  value={notes}
                  maxLength={500}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={saving}
                />
              </Field>
              <label className="flex items-center gap-2.5 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={isKnown}
                  onChange={(event) => setIsKnown(event.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-white/20 bg-black/30 accent-emerald-400"
                />
                Marcar como dispositivo conhecido
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  Salvar alterações
                </Button>
              </div>
            </form>
          ) : null}

          <dl className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-4">
            <KeyValue label="Primeira vez" value={formatDateTime(details.first_seen)} />
            <KeyValue label="Última vez" value={formatDateTime(details.last_seen)} />
            <KeyValue label="Endereços" value={details.addresses.length} />
            <KeyValue label="Conexões" value={details.connections.length} />
          </dl>

          {details.addresses.length > 0 ? (
            <div>
              <h3 className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Endereços IP observados
              </h3>
              <ul className="space-y-1 text-xs">
                {details.addresses.map((address) => (
                  <li
                    key={`${address.ip}-${address.interface}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2"
                  >
                    <span className="font-mono text-zinc-200">{address.ip}</span>
                    <span className="text-zinc-500">
                      {address.interface ?? "—"} · visto{" "}
                      {formatRelative(address.last_seen)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {details.events.length > 0 ? (
            <div>
              <h3 className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Eventos do dispositivo
              </h3>
              <ul className="max-h-44 space-y-1 overflow-y-auto pr-1 text-xs">
                {details.events.slice(0, 15).map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2"
                  >
                    <span className="text-zinc-300">{event.message}</span>
                    <span className="shrink-0 text-[0.62rem] text-zinc-500">
                      {formatRelative(event.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <Button variant="ghost" onClick={() => void load()}>
              Recarregar
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
