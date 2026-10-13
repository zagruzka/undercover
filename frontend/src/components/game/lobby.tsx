"use client";

import {
  BookOpen,
  Crown,
  Eye,
  EyeOff,
  Ghost,
  HatGlasses,
  Minus,
  PenLine,
  Play,
  Plus,
  Share2,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { roleCountError, type RoomView, type Settings } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/** 0 = tanpa batas waktu. */
const VOTE_DURATIONS = [0, 30, 60, 120];

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
        toast.success("Link disalin");
      }
    } catch {
      // Pengguna membatalkan dialog share.
    }
  };

  return (
    <div className="space-y-3">
      <section className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-primary to-amber-500 px-4 py-3 text-primary-foreground">
        <div>
          <p className="text-xs font-semibold">Kode room</p>
          <p className="font-display text-4xl leading-none font-bold tracking-[0.15em]">{room.room_id}</p>
        </div>
        <Button size="sm" onClick={share} className="rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90">
          <Share2 />
          Ajak
        </Button>
      </section>

      <Panel title={`Pemain (${room.players.length})`}>
        <ul className="flex flex-wrap gap-1.5">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex animate-pop-in items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm font-bold",
                !p.connected && "opacity-50",
              )}
            >
              {p.id === room.host_id && <Crown className="size-3.5 text-primary" aria-label="Host" />}
              {p.id === room.me?.id ? `${p.name} (kamu)` : p.name}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Pengaturan">
        <div className="space-y-3">
          <Row label="Role">
            <div className="grid grid-cols-3 gap-1.5">
              <RoleCounter icon={HatGlasses} label="Undercover" value={s.undercover_count} disabled={!isHost} onChange={(v) => update({ undercover_count: v })} />
              <RoleCounter icon={Ghost} label="Mr. White" value={s.mr_white_count} disabled={!isHost} onChange={(v) => update({ mr_white_count: v })} />
              <div className="flex flex-col items-center rounded-xl bg-secondary/60 py-1.5">
                <Users className="size-4" />
                <span className="text-[11px]">Citizen</span>
                <span className="font-display text-xl leading-none font-bold">{Math.max(0, citizens)}</span>
              </div>
            </div>
          </Row>

          <Row label="Kata">
            <Segmented
              disabled={!isHost}
              value={s.word_mode}
              onChange={(v) => update({ word_mode: v })}
              options={[
                { value: "bank", icon: BookOpen, label: "Bank kata" },
                { value: "custom", icon: PenLine, label: "Kata sendiri" },
              ]}
            />
          </Row>

          <Row label="Vote">
            <Segmented
              disabled={!isHost}
              value={s.vote_visibility}
              onChange={(v) => update({ vote_visibility: v })}
              options={[
                { value: "show", icon: Eye, label: "Terbuka" },
                { value: "hide", icon: EyeOff, label: "Rahasia" },
              ]}
            />
          </Row>

          <Row label="Waktu">
            <Segmented
              disabled={!isHost}
              value={String(s.vote_duration)}
              onChange={(v) => update({ vote_duration: Number(v) })}
              options={VOTE_DURATIONS.map((d) => ({
                value: String(d),
                icon: d === 0 ? undefined : Timer,
                label: d === 0 ? "∞" : `${d}s`,
              }))}
            />
          </Row>
        </div>
      </Panel>

      {error && <p className="text-center text-sm font-semibold text-amber-300">{error}</p>}
      {isHost ? (
        <Button size="lg" className="h-12 w-full rounded-xl font-display text-lg font-bold" disabled={!!error} onClick={() => emit("game:start")}>
          <Play className="fill-current" />
          Mulai
        </Button>
      ) : (
        <p className="animate-pulse text-center font-display">Menunggu host memulai…</p>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-card/80 p-3">
      <h2 className="mb-2 font-display font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-sm font-bold transition",
            v === value ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground",
            !disabled && v !== value && "hover:text-foreground",
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}

function RoleCounter({
  icon: Icon,
  label,
  value,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-secondary/60 py-1.5">
      <Icon className="size-4" />
      <span className="text-[11px]">{label}</span>
      <div className="flex items-center gap-1">
        {!disabled && (
          <button type="button" aria-label={`Kurangi ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className="rounded p-0.5 disabled:opacity-30">
            <Minus className="size-3.5" />
          </button>
        )}
        <span className="font-display text-xl leading-none font-bold">{value}</span>
        {!disabled && (
          <button type="button" aria-label={`Tambah ${label}`} onClick={() => onChange(value + 1)} className="rounded p-0.5">
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
