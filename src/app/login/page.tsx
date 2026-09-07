import { LoginForm } from "./LoginForm";

export const metadata = { title: "Staff sign in" };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="staff-shell flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-saffron-500">Baari</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Staff sign in</h1>
        <p className="mt-1 text-sm text-ink-400">
          Host desk, manager and owner access.
        </p>
        <LoginForm nextPath={next ?? "/dashboard"} />
      </div>
    </main>
  );
}
