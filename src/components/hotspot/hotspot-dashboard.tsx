"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { useApiConfig, type ApiConfig } from "@/hooks/use-api-config";
import { useHotspot, type StatusQuery } from "@/hooks/use-hotspot";
import { HotspotApi } from "@/lib/api";
import {
  configInputFromForm,
  formValuesFromConfig,
  HOTSPOT_FORM_DEFAULTS,
  parseChannel,
  validateHotspotForm,
  validateStopValues,
  type HotspotFormValues,
} from "@/lib/hotspot-form";
import { describeError } from "@/lib/utils";

import { ApiSettingsDialog } from "./api-settings-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { ConnectionDetails } from "./connection-details";
import { ControlPanel } from "./control-panel";
import { DashboardHeader } from "./dashboard-header";
import { HotspotForm } from "./hotspot-form";
import { StatusCard } from "./status-card";

function toQuery(values: HotspotFormValues): StatusQuery {
  return {
    interfaceName: values.interface.trim(),
    profileName: values.profileName.trim(),
  };
}

export function HotspotDashboard() {
  const { config, saveConfig } = useApiConfig();
  const api = useMemo(
    () => new HotspotApi(config.baseUrl, config.apiKey),
    [config.baseUrl, config.apiKey],
  );

  const [form, setForm] = useState<HotspotFormValues>(() => ({
    ...HOTSPOT_FORM_DEFAULTS,
  }));
  const [query, setQuery] = useState<StatusQuery>(() =>
    toQuery(HOTSPOT_FORM_DEFAULTS),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hotspot = useHotspot(api, query);
  const toast = useToast();

  // Restaura a última configuração salva no servidor (SSID, senha, interface,
  // banda, canal e perfil) em vez de começar sempre de "Zima-Hotspot".
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const saved = await api.getConfig(controller.signal);
        if (cancelled || saved.is_default) {
          return;
        }
        const next = formValuesFromConfig(saved);
        setForm(next);
        setQuery(toQuery(next));
      } catch {
        // Sem configuração salva ou API indisponível: mantém os defaults.
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api]);

  const updateForm = useCallback((patch: Partial<HotspotFormValues>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const handleCreate = async () => {
    const validation = validateHotspotForm(form);
    if (validation) {
      toast.push({
        tone: "error",
        title: "Revise os dados",
        description: validation,
      });
      return;
    }

    const target = toQuery(form);
    setQuery(target);

    try {
      const result = await hotspot.create(
        {
          name: form.name.trim(),
          password: form.password,
          interface: target.interfaceName,
          profile_name: target.profileName,
          band: form.band,
          channel: parseChannel(form.channel),
          use_sudo: form.useSudo,
        },
        target,
      );

      toast.push({
        tone: "success",
        title: "Hotspot criado",
        description: result.message,
      });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Falha ao criar hotspot",
        description: describeError(error),
      });
    }
  };

  const handleStart = async () => {
    const validation = validateHotspotForm(form);
    if (validation) {
      toast.push({
        tone: "error",
        title: "Revise os dados",
        description: validation,
      });
      return;
    }

    const target = toQuery(form);
    setQuery(target);

    try {
      const result = await hotspot.start(
        {
          name: form.name.trim(),
          password: form.password,
          interface: target.interfaceName,
          profile_name: target.profileName,
          use_sudo: form.useSudo,
        },
        target,
      );

      toast.push({
        tone: "success",
        title: "Hotspot ligado",
        description: result.message,
      });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Falha ao ligar hotspot",
        description: describeError(error),
      });
    }
  };

  const handleStop = async () => {
    const validation = validateStopValues(form.interface, form.profileName);
    if (validation) {
      toast.push({
        tone: "error",
        title: "Revise os dados",
        description: validation,
      });
      return;
    }

    const target = toQuery(form);
    setQuery(target);

    try {
      const result = await hotspot.stop(
        {
          interface: target.interfaceName,
          profile_name: target.profileName,
          use_sudo: form.useSudo,
        },
        target,
      );

      toast.push({
        tone: "success",
        title: "Hotspot desligado",
        description: result.message,
      });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Falha ao desligar hotspot",
        description: describeError(error),
      });
    }
  };

  const handleTeardown = async () => {
    const target = toQuery(form);
    setQuery(target);

    try {
      const result = await hotspot.teardown(target, {
        deleteProfile: true,
        useSudo: form.useSudo,
      });

      toast.push({
        tone: "success",
        title: "Hotspot removido",
        description: result.message,
      });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Falha ao remover hotspot",
        description: describeError(error),
      });
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleSaveApiConfig = (next: ApiConfig) => {
    const saved = saveConfig(next);
    setSettingsOpen(false);
    toast.push({
      tone: "info",
      title: "Configurações salvas",
      description: `Conectando em ${saved.baseUrl}.`,
    });
  };

  const handlePersistConfig = async () => {
    const validation = validateHotspotForm(form);
    if (validation) {
      toast.push({
        tone: "error",
        title: "Revise os dados",
        description: validation,
      });
      return;
    }

    try {
      const saved = await hotspot.saveConfig(configInputFromForm(form));
      toast.push({
        tone: "success",
        title: "Configuração salva",
        description: `A rede "${saved.name}" será carregada automaticamente na próxima visita.`,
      });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Falha ao salvar configuração",
        description: describeError(error),
      });
    }
  };

  return (
    <>
      <div className="relative isolate min-h-screen">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-44 right-[-12%] h-[30rem] w-[30rem] rounded-full bg-emerald-500/[0.09] blur-[130px]" />
          <div className="absolute left-[-16%] top-1/3 h-[26rem] w-[26rem] rounded-full bg-sky-500/[0.06] blur-[130px]" />
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <DashboardHeader
            health={hotspot.health}
            healthChecked={hotspot.healthChecked}
            baseUrl={config.baseUrl}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <StatusCard
            status={hotspot.status}
            loading={hotspot.loading}
            error={hotspot.statusError}
            updatedAt={hotspot.updatedAt}
            onRefresh={() => {
              void hotspot.refresh();
            }}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <HotspotForm
              values={form}
              onChange={updateForm}
              onCreate={handleCreate}
              onSave={handlePersistConfig}
              pending={hotspot.pending}
            />

            <div className="flex flex-col gap-6">
              <ControlPanel
                status={hotspot.status}
                pending={hotspot.pending}
                interfaceName={query.interfaceName}
                profileName={query.profileName}
                onStart={handleStart}
                onStop={handleStop}
                onTeardown={() => setConfirmOpen(true)}
              />
              <ConnectionDetails created={hotspot.lastCreated} />
            </div>
          </div>

          <footer className="flex flex-col items-center justify-between gap-2 border-t border-white/[0.06] pt-5 text-[0.7rem] text-zinc-600 sm:flex-row">
            <p>Zima Hotspot · status atualizado automaticamente a cada 5 s</p>
            <p className="font-mono">API: {config.baseUrl}</p>
          </footer>
        </div>
      </div>

      <ApiSettingsDialog
        open={settingsOpen}
        config={config}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveApiConfig}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Remover hotspot?"
        description={`O hotspot e o perfil "${query.profileName || "Hotspot"}" serão removidos do NetworkManager.`}
        confirmLabel="Remover perfil"
        loading={hotspot.pending === "teardown"}
        onConfirm={() => {
          void handleTeardown();
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
