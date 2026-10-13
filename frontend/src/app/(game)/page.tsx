import { Suspense } from "react";
import { signOut } from "@/auth";
import { HomeActions } from "@/components/game/home-actions";
import { PageLoading } from "@/components/game/page-loading";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { Button } from "@/components/ui/button";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-4 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerAvatar name={user.name ?? "?"} image={user.image ?? null} className="size-12 text-lg" />
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.is_guest ? "Guest" : user.email}</p>
          </div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" className="text-base">
            Keluar
          </Button>
        </form>
      </header>

      <section className="py-2 text-center">
        <div className="motion-safe:animate-wiggle text-8xl" aria-hidden>
          🕵️
        </div>
        <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">
          Under<span className="text-primary">cover</span>
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">Siapa penyamar di antara kalian?</p>
      </section>

      <HomeActions />

      {stats && (
        <section className="grid grid-cols-3 gap-2 text-center">
          <Stat emoji="🎮" label="Main" value={stats.games_played} />
          <Stat emoji="🏆" label="Menang" value={stats.games_won} />
          <Stat emoji="⭐" label="Skor" value={stats.total_score} />
        </section>
      )}

      <section className="rounded-3xl border-2 border-white/10 bg-card/80 p-5 shadow-lg">
        <h2 className="mb-3 font-display text-xl font-bold">Cara main</h2>
        <ol className="space-y-3 text-base">
          <HowTo emoji="🃏">Rebut satu kartu dan intip kata rahasiamu.</HowTo>
          <HowTo emoji="🗣️">Bergantian beri clue (lewat chat atau langsung), tanpa menyebut katanya.</HowTo>
          <HowTo emoji="👆">Ketuk kartu orang yang kamu curigai untuk vote.</HowTo>
          <HowTo emoji="👻">Mr. White tak punya kata — kalau tereliminasi, dia boleh menebak dan bisa langsung menang!</HowTo>
        </ol>
      </section>
    </main>
  );
}

function Stat({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-white/10 bg-card/80 p-3">
      <p className="text-2xl" aria-hidden>
        {emoji}
      </p>
      <p className="font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function HowTo({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span>{children}</span>
    </li>
  );
}
