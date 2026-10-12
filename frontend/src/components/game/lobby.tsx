"use client";

import { Crown, Minus, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { useSocket } from "@/components/socket-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCountError, type RoomView, type Settings } from "@/lib/game-types";

const DURATIONS = [15, 30, 45, 60, 90, 120];

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
        toast.success("Link room disalin");
      }
    } catch {
      // Pengguna membatalkan dialog share.
    }
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Bagikan kode ini ke teman di sekitarmu</p>
          <p className="font-mono text-5xl font-bold tracking-[0.25em]">{room.room_id}</p>
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 />
            Bagikan link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Pemain
            <Badge variant="secondary">{room.players.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {room.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
                <PlayerAvatar name={p.name} image={p.image} />
                <span className={`min-w-0 flex-1 truncate text-sm ${p.connected ? "" : "text-muted-foreground"}`}>
                  {p.name}
                  {p.id === room.me?.id && " (kamu)"}
                </span>
                {p.id === room.host_id && <Crown className="size-4 shrink-0 text-amber-500" aria-label="Host" />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isHost ? "Pengaturan Host" : "Pengaturan Game"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Stepper
            label="Undercover"
            value={s.undercover_count}
            disabled={!isHost}
            onChange={(v) => update({ undercover_count: v })}
          />
          <Stepper
            label="Mr. White"
            value={s.mr_white_count}
            disabled={!isHost}
            onChange={(v) => update({ mr_white_count: v })}
          />
          <div className="flex items-center justify-between text-sm">
            <span>Citizen</span>
            <span className="w-24 text-center font-semibold tabular-nums">{Math.max(0, citizens)}</span>
          </div>

          <DurationPicker
            label="Durasi giliran"
            value={s.turn_duration}
            disabled={!isHost}
            onChange={(v) => update({ turn_duration: v })}
          />
          <DurationPicker
            label="Durasi voting"
            value={s.vote_duration}
            disabled={!isHost}
            onChange={(v) => update({ vote_duration: v })}
          />

          {error && <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}

          {isHost ? (
            <Button size="lg" className="h-12 w-full text-base" disabled={!!error} onClick={() => emit("game:start")}>
              Mulai Game
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Menunggu host memulai game…</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stepper({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <div className="flex w-24 items-center justify-between">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Kurangi ${label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <span className="font-semibold tabular-nums">{value}</span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Tambah ${label}`}
          disabled={disabled}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function DurationPicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {DURATIONS.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={d === value ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange(d)}
            className="min-w-12"
          >
            {d}s
          </Button>
        ))}
      </div>
    </div>
  );
}
