"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { LockIcon, ShieldIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

interface ChangePasswordFormProps {
  username: string;
}

const MIN_LENGTH = 12;

export function ChangePasswordForm({ username }: ChangePasswordFormProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Informe a senha atual.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (newPassword === currentPassword) {
      setError("A nova senha precisa ser diferente da senha inicial.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }

    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "Não foi possível alterar a senha. Confira a senha atual.",
        );
        return;
      }

      // Better Auth already rotated the session cookie (revokeOtherSessions).
      // Clear the first-login flag so the BFF stops blocking the panel.
      let cleared = false;
      for (let attempt = 0; attempt < 2 && !cleared; attempt += 1) {
        try {
          const response = await fetch("/api/account/password-changed", {
            method: "POST",
            cache: "no-store",
          });
          cleared = response.ok;
        } catch {
          cleared = false;
        }
      }

      if (!cleared) {
        setError(
          "A senha foi alterada, mas o painel não confirmou a atualização. Recarregue a página e entre novamente.",
        );
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 text-amber-950 shadow-[0_20px_50px_-16px_rgba(251,191,36,0.7)]">
          <ShieldIcon className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          Troque a senha inicial
        </h1>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
          A conta <span className="font-mono text-zinc-300">{username}</span>{" "}
          ainda usa a senha de fábrica. Defina uma senha própria para liberar o
          painel.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm"
      >
        {error ? <FormMessage>{error}</FormMessage> : null}

        <Field label="Senha atual" htmlFor="current-password">
          <input
            id="current-password"
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pending}
            required
          />
        </Field>

        <Field
          label="Nova senha"
          htmlFor="new-password"
          hint={`Mínimo de ${MIN_LENGTH} caracteres, diferente da senha inicial.`}
        >
          <input
            id="new-password"
            className={inputClass}
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={pending}
            required
          />
        </Field>

        <Field label="Confirmar nova senha" htmlFor="confirm-password">
          <input
            id="confirm-password"
            className={inputClass}
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending}
            required
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          block
          loading={pending}
          icon={<LockIcon className="h-4 w-4" />}
        >
          Salvar nova senha
        </Button>

        <p className="text-[0.7rem] leading-relaxed text-zinc-600">
          As outras sessões serão encerradas. Você continuará conectado neste
          navegador.
        </p>
      </form>
    </div>
  );
}
