import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireSession } from "@/lib/server/session";

export const instant = false;

export default async function ChangePasswordPage() {
  const session = await requireSession();
  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <ChangePasswordForm
      username={session.user.username ?? session.user.name}
    />
  );
}
