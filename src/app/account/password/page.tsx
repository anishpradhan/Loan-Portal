import { requireUser } from "@/server/auth/session";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Change password" };

export default async function PasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-ink">Change password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          {user.mustChangePassword ? "Please set a new password before continuing." : `Signed in as ${user.username}.`}
        </p>
        <PasswordForm />
      </div>
    </main>
  );
}
