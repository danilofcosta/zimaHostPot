"use client";

import { useState, type FormEvent } from "react";

import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  SparklesIcon,
  WifiIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass } from "@/components/ui/field";
import type { HotspotAction } from "@/hooks/use-hotspot";
import {
  CHANNEL_OPTIONS,
  validateHotspotForm,
  type HotspotFormValues,
} from "@/lib/hotspot-form";
import { CARD_CLASS, cn, generatePassword } from "@/lib/utils";

interface HotspotFormProps {
  values: HotspotFormValues;
  onChange: (patch: Partial<HotspotFormValues>) => void;
  onCreate: () => void;
  onSave: () => void;
  pending: HotspotAction | null;
}

export function HotspotForm({
  values,
  onChange,
  onCreate,
  onSave,
  pending,
}: HotspotFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = pending === "create";
  const saving = pending === "save";

  const update = (patch: Partial<HotspotFormValues>) => {
    setError(null);
    onChange(patch);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateHotspotForm(values);
    if (validation) {
      setError(validation);
      return;
    }

    setError(null);
    onCreate();
  };

  return (
    <section className={cn(CARD_CLASS, "p-5 sm:p-6")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <WifiIcon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Novo hotspot</h2>
          <p className="text-xs text-zinc-500">
            Configure a rede e ative na interface escolhida.
          </p>
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome do hotspot (SSID)"
            htmlFor="ssid"
            className="sm:col-span-2"
            hint="Até 32 bytes. É o nome que aparece na lista de redes."
          >
            <input
              id="ssid"
              name="ssid"
              className={inputClass}
              value={values.name}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              placeholder="Zima-Hotspot"
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>

          <Field
            label="Senha"
            htmlFor="password"
            className="sm:col-span-2"
            hint="WPA2 · entre 8 e 63 caracteres."
          >
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className={cn(inputClass, "pr-24 font-mono")}
                value={values.password}
                minLength={8}
                maxLength={63}
                autoComplete="new-password"
                spellCheck={false}
                placeholder="••••••••"
                onChange={(event) => update({ password: event.target.value })}
              />
              <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    update({ password: generatePassword(16) })
                  }
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  title="Gerar senha forte"
                  aria-label="Gerar senha forte"
                >
                  <SparklesIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </Field>

          <Field
            label="Interface"
            htmlFor="interface"
            hint="Ex.: wlan0, wlp2s0."
          >
            <input
              id="interface"
              name="interface"
              className={cn(inputClass, "font-mono")}
              value={values.interface}
              maxLength={15}
              autoComplete="off"
              spellCheck={false}
              placeholder="wlan0"
              onChange={(event) => update({ interface: event.target.value })}
            />
          </Field>

          <Field
            label="Perfil NetworkManager"
            htmlFor="profile"
            hint="Nome do perfil salvo no sistema."
          >
            <input
              id="profile"
              name="profile"
              className={cn(inputClass, "font-mono")}
              value={values.profileName}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder="Hotspot"
              onChange={(event) => update({ profileName: event.target.value })}
            />
          </Field>

          <Field label="Banda" hint="2,4 GHz tem mais alcance; 5 GHz é mais rápido.">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                aria-pressed={values.band === "bg"}
                onClick={() => update({ band: "bg", channel: "" })}
                className={cn(
                  "rounded-lg px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                  values.band === "bg"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                <span className="block text-xs font-semibold">2,4 GHz</span>
                <span className="block text-[0.62rem] text-zinc-500">
                  alcance
                </span>
              </button>
              <button
                type="button"
                aria-pressed={values.band === "a"}
                onClick={() => update({ band: "a", channel: "" })}
                className={cn(
                  "rounded-lg px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                  values.band === "a"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                <span className="block text-xs font-semibold">5 GHz</span>
                <span className="block text-[0.62rem] text-zinc-500">
                  velocidade
                </span>
              </button>
            </div>
          </Field>

          <Field
            label="Canal"
            htmlFor="channel"
            hint="Automático deixa o NetworkManager escolher."
          >
            <select
              id="channel"
              name="channel"
              className={inputClass}
              value={values.channel}
              onChange={(event) => update({ channel: event.target.value })}
            >
              {CHANNEL_OPTIONS[values.band].map((option) => (
                <option key={option.value || "auto"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={values.useSudo}
          onClick={() => update({ useSudo: !values.useSudo })}
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-left transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <span>
            <span className="block text-xs font-medium text-zinc-200">
              Executar comandos com sudo
            </span>
            <span className="mt-0.5 block text-[0.7rem] text-zinc-500">
              Necessário para o nmcli criar e alterar conexões.
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full transition-colors",
              values.useSudo ? "bg-emerald-400" : "bg-white/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                values.useSudo ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>

        {error ? <FormMessage>{error}</FormMessage> : null}

        <div className="grid gap-2 pt-1 sm:grid-cols-[auto_1fr]">
          <Button
            type="button"
            variant="secondary"
            loading={saving}
            disabled={pending !== null && !saving}
            icon={<CheckIcon className="h-4 w-4" />}
            onClick={onSave}
          >
            Salvar
          </Button>
          <Button
            type="submit"
            variant="primary"
            block
            loading={submitting}
            disabled={pending !== null && !submitting}
            icon={<WifiIcon className="h-4 w-4" />}
          >
            Criar e ativar hotspot
          </Button>
        </div>

        <p className="text-[0.7rem] leading-relaxed text-zinc-500">
          <strong className="font-medium text-zinc-400">Salvar</strong> guarda
          estes dados no servidor para a próxima visita. A criação substitui o
          perfil{" "}
          <span className="font-mono text-zinc-400">
            {values.profileName || "Hotspot"}
          </span>{" "}
          existente e ativa a rede imediatamente.
        </p>
      </form>
    </section>
  );
}
