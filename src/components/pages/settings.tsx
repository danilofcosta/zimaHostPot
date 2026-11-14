"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import {
  Badge,
  InlineError,
  InlineInfo,
  KeyValue,
  PageHeader,
  Panel,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";

const MIN_LENGTH = 12;

interface SettingsPageProps {
  user: {
    name: string;
    username: string;
    email: string;
    createdAt: string;
    mustChangePassword: boolean;
  };
}

export function SettingsPage({ user }: SettingsPageProps) {
  const router = useRouter();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
      setError("A nova senha precisa ser diferente da senha atual.");
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

      // Better Auth rotated the session cookie (revokeOtherSessions). Clear the
      // first-login flag as well; the endpoint is idempotent.
      await fetch("/api/account/password-changed", {
        method: "POST",
        cache: "no-store",
      }).catch(() => null);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      toast.push({
        tone: "success",
        title: "Senha atualizada",
        description: "As outras sessões foram encerradas.",
      });
      router.refresh();
    } catch {
      setError("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sistema"
        title="Configurações"
        description="Conta do operador e segurança do painel. Não há cadastro público: apenas a conta administrativa criada na primeira inicialização pode entrar."
      />

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="Conta"
          description="Dados da sessão autenticada."
          action={
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-300">
              {(user.name || user.username || "?").trim().slice(0, 1).toUpperCase()}
            </span>
          }
        >
          <dl className="grid grid-cols-2 gap-4">
            <KeyValue label="Nome" value={user.name} />
            <KeyValue label="Usuário" value={user.username} mono />
            <KeyValue label="E-mail" value={user.email} mono />
            <KeyValue label="Criada em" value={formatDateTime(user.createdAt)} />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            <Badge tone={user.mustChangePassword ? "warning" : "success"}>
              {user.mustChangePassword
                ? "troca de senha pendente"
                : "senha definida"}
            </Badge>
            <Badge tone="neutral">sessão de 7 dias</Badge>
          </div>

          <div className="mt-5">
            <Button
              variant="danger"
              size="sm"
              onClick={() => void signOut()}
              loading={signingOut}
              icon={<LogOut className="h-3.5 w-3.5" />}
            >
              Encerrar sessão
            </Button>
          </div>
        </Panel>

        <Panel
          title="Alterar senha"
          description="A senha nunca é gravada em texto claro; o Better Auth guarda apenas o hash."
        >
          <form onSubmit={submit} className="space-y-4">
            {error ? <InlineError>{error}</InlineError> : null}

            <Field label="Senha atual" htmlFor="settings-current-password">
              <input
                id="settings-current-password"
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
              htmlFor="settings-new-password"
              hint={`Mínimo de ${MIN_LENGTH} caracteres, diferente da senha atual.`}
            >
              <input
                id="settings-new-password"
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

            <Field
              label="Confirmar nova senha"
              htmlFor="settings-confirm-password"
            >
              <input
                id="settings-confirm-password"
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
              loading={pending}
              icon={<KeyRound className="h-4 w-4" />}
            >
              Salvar nova senha
            </Button>

            <InlineInfo>
              <span className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Ao salvar, todas as outras sessões são encerradas. Este navegador
                continua conectado.
              </span>
            </InlineInfo>
          </form>
        </Panel>
      </div>

      <Panel title="Segurança do painel" description="Como o acesso é protegido.">
        <ul className="space-y-3 text-xs leading-relaxed text-zinc-400">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            O navegador só conversa com a própria origem. A API Python, a
            <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.68rem] text-zinc-300">
              API_KEY
            </code>
            e o
            <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.68rem] text-zinc-300">
              BETTER_AUTH_SECRET
            </code>
            ficam restritos ao servidor Next.js (BFF).
          </li>
          <li className="flex items-start gap-2.5">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            A conta inicial (
            <span className="font-mono text-zinc-300">casaos</span>) só é criada
            quando o banco ainda não tem usuários. Ela nunca é recriada nem tem a
            senha redefinida automaticamente.
          </li>
          <li className="flex items-start gap-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Enquanto a troca da senha inicial não for concluída, o BFF responde
            HTTP 428 a qualquer operação administrativa.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
