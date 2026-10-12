import { Suspense } from "react";
import { signOut } from "@/auth";
import { HomeActions } from "@/components/game/home-actions";
import { PageLoading } from "@/components/game/page-loading";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { signBackendToken } from "@/lib/ws-token";

interface Stats {
  games_played: number;
  games_won: number;
  total_score: number;
}

async function getStats(token: string): Promise<Stats | null> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/me/stats`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const user = await requireUser("/");
  const stats = await getStats(await signBackendToken(user));

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 pt-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerAvatar name={user.name ?? "?"} image={user.image ?? null} className="size-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.is_guest ? "Guest" : user.email}</p>
          </div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Keluar
          </Button>
        </form>
      </header>

      <section className="text-center">
        <div className="text-5xl" aria-hidden>
          🕵️
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Undercover</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kumpulkan teman, buka web ini di HP masing-masing, dan temukan si penyamar.
        </p>
      </section>

      <HomeActions />

      {stats && (
        <Card>
          <CardContent className="grid grid-cols-3 text-center">
            <Stat label="Main" value={stats.games_played} />
            <Stat label="Menang" value={stats.games_won} />
            <Stat label="Skor" value={stats.total_score} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Cara main</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Citizen</b> dan <b>Undercover</b> mendapat kata yang mirip, tapi tidak tahu perannya.
            </li>
            <li>
              <b>Mr. White</b> tidak mendapat kata, harus menebak dari petunjuk.
            </li>
            <li>Bergiliran beri satu petunjuk singkat, lalu voting untuk mengeliminasi.</li>
            <li>Mr. White yang tereliminasi boleh menebak kata Citizen — jika benar, langsung menang!</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
