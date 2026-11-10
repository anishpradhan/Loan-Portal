import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-bg">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent grid place-items-center text-white font-semibold">LP</div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Loan Portfolio Monitor</h1>
            <p className="text-sm text-muted">Sign in with your staff account</p>
          </div>
        </div>
        <LoginForm next={next ?? "/"} />
        <p className="mt-6 text-xs text-muted">
          Access is restricted to authorised staff. Activity is logged.
        </p>
      </div>
    </main>
  );
}
