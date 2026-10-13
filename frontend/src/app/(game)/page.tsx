import { Gamepad2, Ghost, HatGlasses, Layers, LogOut, MessageCircle, Star, Trophy, Vote, type LucideIcon } from "lucide-react";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlayerAvatar name={user.name ?? "?"} image={user.image ?? null} className="size-9" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display font-bold">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.is_guest ? "Guest" : user.email}</p>
          </div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut />
            Keluar
          </Button>
        </form>
      </header>

      <section className="flex flex-col items-center py-2 text-center">
        <HatGlasses className="size-14 text-primary motion-safe:animate-wiggle" strokeWidth={2} />
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Under<span className="text-primary">cover</span>
        </h1>
        <p className="text-sm text-muted-foreground">Siapa penyamar di antara kalian?</p>
      </section>

      <HomeActions />

      {stats && (
        <section className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={Gamepad2} label="Main" value={stats.games_played} />
          <Stat icon={Trophy} label="Menang" value={stats.games_won} />
          <Stat icon={Star} label="Skor" value={stats.total_score} />
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-card/80 p-3">
        <h2 className="mb-2 font-display font-bold">Cara main</h2>
        <ol className="space-y-1.5 text-sm">
          <HowTo icon={Layers}>Rebut kartu, intip katamu.</HowTo>
          <HowTo icon={MessageCircle}>Beri clue bergantian, jangan sebut katanya.</HowTo>
          <HowTo icon={Vote}>Ketuk kartu tersangka untuk vote.</HowTo>
          <HowTo icon={Ghost}>Mr. White tanpa kata; bisa menang lewat tebakan.</HowTo>
        </ol>
      </section>
    </main>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/80 py-2">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="font-display text-xl leading-tight font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function HowTo({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}
