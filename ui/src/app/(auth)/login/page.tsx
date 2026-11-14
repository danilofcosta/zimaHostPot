import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/server/session";

export const instant = false;

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.user.mustChangePassword ? "/change-password" : "/");
  }

  return <LoginForm />;
}
