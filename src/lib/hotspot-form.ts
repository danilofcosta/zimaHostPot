import type { Band, HotspotConfig, HotspotConfigInput } from "./types";
import { IFNAME_PATTERN } from "./utils";

export interface HotspotFormValues {
  name: string;
  password: string;
  interface: string;
  profileName: string;
  band: Band;
  channel: string;
  useSudo: boolean;
}

export const HOTSPOT_FORM_DEFAULTS: HotspotFormValues = {
  // Empty on purpose: the UI asks for the network name instead of silently
  // reusing "Zima-Hotspot". Saved values are loaded from the server.
  name: "",
  password: "",
  interface: "wlan0",
  profileName: "Hotspot",
  band: "bg",
  channel: "",
  useSudo: true,
};

export const CHANNEL_OPTIONS: Record<
  Band,
  Array<{ value: string; label: string }>
> = {
  bg: [
    { value: "", label: "Automático" },
    { value: "1", label: "Canal 1" },
    { value: "6", label: "Canal 6" },
    { value: "11", label: "Canal 11" },
  ],
  a: [
    { value: "", label: "Automático" },
    { value: "36", label: "Canal 36" },
    { value: "40", label: "Canal 40" },
    { value: "44", label: "Canal 44" },
    { value: "48", label: "Canal 48" },
    { value: "149", label: "Canal 149" },
    { value: "153", label: "Canal 153" },
    { value: "157", label: "Canal 157" },
    { value: "161", label: "Canal 161" },
    { value: "165", label: "Canal 165" },
  ],
};

export function formValuesFromConfig(config: HotspotConfig): HotspotFormValues {
  return {
    name: config.name,
    password: config.password,
    interface: config.interface,
    profileName: config.profile_name,
    band: config.band,
    channel: config.channel === null ? "" : String(config.channel),
    useSudo: config.use_sudo,
  };
}

export function configInputFromForm(
  values: HotspotFormValues,
): HotspotConfigInput {
  return {
    name: values.name.trim(),
    password: values.password,
    interface: values.interface.trim(),
    profile_name: values.profileName.trim(),
    band: values.band,
    channel: parseChannel(values.channel),
    use_sudo: values.useSudo,
  };
}

export function parseChannel(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validateHotspotForm(values: HotspotFormValues): string | null {
  const ssid = values.name.trim();
  if (!ssid) {
    return "Informe o nome do hotspot (SSID).";
  }

  if (new TextEncoder().encode(ssid).length > 32) {
    return "O SSID deve ter no máximo 32 bytes.";
  }

  if (values.password.length < 8 || values.password.length > 63) {
    return "A senha deve ter entre 8 e 63 caracteres.";
  }

  if (!IFNAME_PATTERN.test(values.interface.trim())) {
    return "Interface inválida. Use um nome como wlan0 ou wlp2s0.";
  }

  if (!values.profileName.trim()) {
    return "Informe o nome do perfil do NetworkManager.";
  }

  const channel = parseChannel(values.channel);
  if (values.channel && channel === null) {
    return "Canal inválido.";
  }

  if (channel !== null) {
    if (values.band === "bg" && channel > 14) {
      return "Na faixa de 2,4 GHz use um canal entre 1 e 14.";
    }
    if (values.band === "a" && channel < 32) {
      return "Na faixa de 5 GHz use um canal a partir de 32.";
    }
  }

  return null;
}

export function validateStopValues(
  interfaceName: string,
  profileName: string,
): string | null {
  if (!IFNAME_PATTERN.test(interfaceName.trim())) {
    return "Interface inválida. Use um nome como wlan0 ou wlp2s0.";
  }

  if (!profileName.trim()) {
    return "Informe o nome do perfil do NetworkManager.";
  }

  return null;
}
