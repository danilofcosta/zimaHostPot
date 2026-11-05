"use client";

import { useState, type FormEvent } from "react";

import {
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  ServerIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { ApiConfig } from "@/hooks/use-api-config";
import { cn, normalizeBaseUrl } from "@/lib/utils";

interface ApiSettingsDialogProps {
  open: boolean;
  config: ApiConfig;
  onClose: () => void;
  onSave: (config: ApiConfig) => void;
}

interface SettingsFormProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
}

function validateUrl(value: string): string | null {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    return "Informe a URL da API.";
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Use uma URL http:// ou https://.";
    }
  } catch {
    return "URL inválida. Exemplo: http://localhost:6565";
  }

  return null;
}

function SettingsForm({ config, onSave }: SettingsFormProps) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateUrl(baseUrl);
    if (validation) {
      setError(validation);
      return;
    }

    setError(null);
    onSave({ baseUrl: normalizeBaseUrl(baseUrl), apiKey });
  };

  const docsUrl = `${normalizeBaseUrl(baseUrl) || config.baseUrl}/docs`;

  return (
    <form
      id="api-settings-form"
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <Field
        label="URL da API"
        htmlFor="api-url"
        hint="Inclua o protocolo e a porta. Ex.: http://localhost:6565"
      >
        <div className="relative">
          <ServerIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="api-url"
            className={cn(inputClass, "pl-10 font-mono text-xs sm:text-sm")}
            value={baseUrl}
            autoComplete="off"
            spellCheck={false}
            placeholder="http://localhost:6565"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>
      </Field>

      <Field
        label="API key"
        htmlFor="api-key"
        hint="Deixe vazio quando o servidor não exige X-API-Key."
      >
        <div className="relative">
          <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="api-key"
            type={showKey ? "text" : "password"}
            className={cn(inputClass, "pl-10 pr-11 font-mono")}
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="opcional"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey((current) => !current)}
            className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            title={showKey ? "Ocultar chave" : "Mostrar chave"}
            aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
          >
            {showKey ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </Field>

      {error ? <FormMessage>{error}</FormMessage> : null}

      <a
        href={docsUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
      >
        Abrir documentação da API
        <ExternalLinkIcon className="h-3.5 w-3.5" />
      </a>
    </form>
  );
}

export function ApiSettingsDialog({
  open,
  config,
  onClose,
  onSave,
}: ApiSettingsDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurações da API"
      description="Endereço do servidor FastAPI e chave de acesso opcional."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="api-settings-form">
            Salvar configurações
          </Button>
        </>
      }
    >
      <SettingsForm config={config} onSave={onSave} />
    </Modal>
  );
}
