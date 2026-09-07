"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, LogOut, Share2 } from "lucide-react";
import { leaveQueueAction } from "./actions";

/**
 * The guest's live view refreshes by re-fetching the server component rather
 * than opening a realtime socket: a guest may be on a train, on 3G, or with
 * the screen locked, and a plain poll survives all three. Backs off when the
 * tab is hidden so we aren't burning a phone battery in someone's pocket.
 */
export function StatusLive({ token, active }: { token: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, active]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My place in line", url });
        return;
      } catch {
        // User dismissed the sheet — fall through to copying.
      }
    }
    await navigator.clipboard.writeText(url);
  }

  return (
    <div className="mt-8 space-y-3">
      {active && (
        <button
          onClick={() => startTransition(() => router.refresh())}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-3 text-sm font-medium text-ink-700"
        >
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
          Refresh
        </button>
      )}

      <button
        onClick={share}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-3 text-sm font-medium text-ink-700"
      >
        <Share2 className="size-4" aria-hidden /> Notify a friend
      </button>

      {active && (
        confirmLeave ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              Leave the line? You'll lose your place and have to join again from the back.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  await leaveQueueAction(token);
                  router.refresh();
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {leaving ? "Leaving…" : "Yes, leave"}
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-lg border border-ink-200 bg-white py-2.5 text-sm font-medium text-ink-700"
              >
                Stay in line
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-ink-400"
          >
            <LogOut className="size-4" aria-hidden /> Leave the line
          </button>
        )
      )}
    </div>
  );
}
