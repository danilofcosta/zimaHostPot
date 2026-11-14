import type { DeviceState, DeviceType } from "./types";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

export function formatBitRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  if (value < 1_000) {
    return `${Math.round(value)} bps`;
  }
  if (value < 1_000_000) {
    return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} Kbps`;
  }
  if (value < 1_000_000_000) {
    return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} Mbps`;
  }
  return `${(value / 1_000_000_000).toFixed(2)} Gbps`;
}

export function formatByteRate(value: number | null | undefined): string {
  return `${formatBytes(value ?? null)}/s`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function formatClock(value: Date | null): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

const relativeFormatter = new Intl.RelativeTimeFormat("pt-BR", {
  numeric: "auto",
});

export function formatRelative(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (Math.abs(seconds) < 45) {
    return "agora";
  }
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return relativeFormatter.format(Math.round(seconds / size), unit);
    }
  }
  return "agora";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) {
    return "—";
  }
  const total = Math.round(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${total}s`;
}

export function formatSignal(dbm: number | null | undefined): string {
  if (dbm === null || dbm === undefined) {
    return "—";
  }
  const quality = signalQuality(dbm);
  return `${dbm} dBm (${quality}%)`;
}

export function signalQuality(dbm: number): number {
  const clamped = Math.min(Math.max(dbm, -100), -30);
  return Math.round(((clamped + 100) * 100) / 70);
}

export const DEVICE_STATE_LABELS: Record<DeviceState, string> = {
  associated: "Associado ao Wi-Fi",
  active: "Ativo na rede",
  dhcp_only: "Apenas lease DHCP",
  inactive: "Inativo",
  disconnected: "Desconectado",
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  unknown: "Desconhecido",
  phone: "Celular",
  tablet: "Tablet",
  computer: "Computador",
  tv: "TV",
  iot: "IoT",
  network: "Equipamento de rede",
  printer: "Impressora",
  other: "Outro",
};

export function deviceStateLabel(state: string | null | undefined): string {
  if (!state) return "—";
  return DEVICE_STATE_LABELS[state as DeviceState] ?? state;
}

export function deviceTypeLabel(type: string | null | undefined): string {
  if (!type) return "Desconhecido";
  return DEVICE_TYPE_LABELS[type as DeviceType] ?? type;
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case "error":
      return "Erro";
    case "warning":
      return "Atenção";
    case "success":
      return "Sucesso";
    case "info":
      return "Informação";
    default:
      return severity;
  }
}

export function eventTypeLabel(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function shortMac(mac: string): string {
  return mac.toLowerCase();
}
