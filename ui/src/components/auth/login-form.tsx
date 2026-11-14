"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { LockIcon, WifiIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, inputClass } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Informe usuário e senha.");
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signIn.username({
        username: username.trim(),
        password,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "Usuário ou senha inválidos. Verifique e tente novamente.",
        );
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível entrar. Verifique a conexão com o painel.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-500 text-emerald-950 shadow-[0_20px_50px_-16px_rgba(52,211,153,0.8)]">
          <WifiIcon className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          Zima Hotspot
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Entre com o usuário administrador para gerenciar o hotspot.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm"
      >
        {error ? <FormMessage>{error}</FormMessage> : null}

        <Field label="Usuário" htmlFor="username">
          <input
            id="username"
            name="username"
            className={inputClass}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="casaos"
            disabled={pending}
            required
          />
        </Field>

        <Field label="Senha" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            className={inputClass}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
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
          Entrar
        </Button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-zinc-600">
        O cadastro público é desativado. A conta inicial é criada apenas na
        primeira inicialização e a senha deve ser trocada no primeiro acesso.
      </p>
    </div>
  );
}
