"use client";

import { Crown, Minus, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { roleCountError, type RoomView, type Settings, type WordMode } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/** 0 = tanpa batas waktu. */
const VOTE_DURATIONS = [0, 30, 60, 90, 120, 180];

const WORD_MODES: { value: WordMode; emoji: string; label: string; hint: string }[] = [
  { value: "bank", emoji: "📚", label: "Bank Kata", hint: "Kata acak dari sistem" },
  { value: "custom", emoji: "✍️", label: "Kata Sendiri", hint: "Tiap pemain kirim 2 kata" },
];

export function Lobby({ room }: { room: RoomView }) {
  const { emit } = useSocket();
  const isHost = room.me?.is_host ?? false;
  const s = room.settings;
  const citizens = room.players.length - s.undercover_count - s.mr_white_count;
  const error = roleCountError(s, room.players.length);

  const update = (patch: Partial<Settings>) => emit("room:update_settings", { settings: { ...s, ...patch } });

  const share = async () => {
    const url = `${window.location.origin}/room/${room.room_id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Main Undercover", text: `Kode room: ${room.room_id}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link room disalin!");
      }
    } catch {
      // Pengguna membatalkan dialog share.
    }
  };

  return (
    <div className="space-y-4">
      {/* Kode room */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-amber-500 p-5 text-center text-primary-foreground shadow-xl">
        <p className="font-display text-lg font-semibold">Kode Room</p>
        <p className="font-display text-6xl font-bold tracking-[0.2em]">{room.room_id}</p>
        <Button onClick={share} className="mt-3 h-11 rounded-full bg-primary-foreground px-5 text-base text-primary hover:bg-primary-foreground/90">
          <Share2 />
          Ajak teman
        </Button>
      </section>

      {/* Pemain */}
      <Panel title={`Pemain (${room.players.length})`}>
        <ul className="flex flex-wrap gap-2">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex animate-pop-in items-center gap-2 rounded-full border-2 border-white/15 bg-secondary py-1 pr-4 pl-1",
                !p.connected && "opacity-50",
              )}
            >
              <PlayerAvatar name={p.name} image={p.image} className="size-9" />
              <span className="font-bold">{p.id === room.me?.id ? `${p.name} (kamu)` : p.name}</span>
              {p.id === room.host_id && <Crown className="size-5 text-primary" aria-label="Host" />}
            </li>
          ))}
        </ul>
      </Panel>

      {/* Pengaturan */}
      <Panel title={isHost ? "Atur permainan" : "Pengaturan"}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {WORD_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={!isHost}
                onClick={() => update({ word_mode: m.value })}
                className={cn(
                  "rounded-2xl border-4 p-3 text-center transition",
                  s.word_mode === m.value ? "border-primary bg-primary/15" : "border-white/10 bg-secondary/50",
                  isHost && "active:scale-95",
                )}
              >
                <span className="text-3xl" aria-hidden>
                  {m.emoji}
                </span>
                <p className="font-display text-lg font-bold">{m.label}</p>
                <p className="text-sm text-muted-foreground">{m.hint}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <RoleCounter
              emoji="🕵️"
              label="Undercover"
              value={s.undercover_count}
              disabled={!isHost}
              onChange={(v) => update({ undercover_count: v })}
            />
            <RoleCounter
              emoji="👻"
              label="Mr. White"
              value={s.mr_white_count}
              disabled={!isHost}
              onChange={(v) => update({ mr_white_count: v })}
            />
            <div className="rounded-2xl bg-secondary/50 p-2">
              <span className="text-3xl" aria-hidden>
                🧑‍🤝‍🧑
              </span>
              <p className="text-sm font-semibold">Citizen</p>
              <p className="font-display text-3xl font-bold">{Math.max(0, citizens)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 font-display text-lg font-semibold">⏱️ Waktu voting</p>
            <div className="flex flex-wrap gap-2">
              {VOTE_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!isHost}
                  onClick={() => update({ vote_duration: d })}
                  className={cn(
                    "h-11 min-w-16 rounded-full border-2 px-4 font-display text-lg font-bold transition",
                    d === s.vote_duration
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/15 bg-secondary/50",
                    isHost && "active:scale-95",
                  )}
                >
                  {d === 0 ? "∞" : `${d}s`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {error && <p className="text-center text-base font-semibold text-amber-300">⚠️ {error}</p>}
      {isHost ? (
        <Button
          size="lg"
          className="h-16 w-full rounded-2xl font-display text-2xl font-bold shadow-xl shadow-primary/30"
          disabled={!!error}
          onClick={() => emit("game:start")}
        >
          MULAI! 🚀
        </Button>
      ) : (
        <p className="animate-pulse text-center font-display text-xl">Menunggu host memulai…</p>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-white/10 bg-card/80 p-4 shadow-lg">
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function RoleCounter({
  emoji,
  label,
  value,
  disabled,
  onChange,
}: {
  emoji: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-2">
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex items-center justify-between">
        {!disabled && (
          <Button size="icon-sm" variant="ghost" aria-label={`Kurangi ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
            <Minus />
          </Button>
        )}
        <p className="flex-1 font-display text-3xl font-bold">{value}</p>
        {!disabled && (
          <Button size="icon-sm" variant="ghost" aria-label={`Tambah ${label}`} onClick={() => onChange(value + 1)}>
            <Plus />
          </Button>
        )}
      </div>
    </div>
  );
}
