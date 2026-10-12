"use client";

import { Check, Eye, EyeOff, Skull, Timer, WifiOff } from "lucide-react";
import { useState } from "react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { MrWhiteGuessDialog } from "@/components/game/mr-white-dialog";
import { VoteDialog } from "@/components/game/vote-dialog";
import { useSocket } from "@/components/socket-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCountdown } from "@/hooks/use-countdown";
import { LIMITS, ROLE_LABEL, ROLE_STYLE, type Phase, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Lobby",
  description: "Fase Deskripsi",
  voting: "Fase Voting",
  mr_white_guess: "Tebakan Mr. White",
  ended: "Selesai",
};

export function GameHud({ room }: { room: RoomView }) {
  const { clockOffset } = useSocket();
  const remaining = useCountdown(room.deadline, clockOffset);
  const me = room.players.find((p) => p.id === room.me?.id);
  const ended = room.phase === "ended";
  // Dialog voting terbuka otomatis setiap ronde, kecuali pemain menutupnya di ronde tersebut.
  const [voteDismissedRound, setVoteDismissedRound] = useState<number | null>(null);
  const voteOpen = voteDismissedRound !== room.round;
  const setVoteOpen = (open: boolean) => setVoteDismissedRound(open ? null : room.round);

  const canVote = room.phase === "voting" && !!me?.alive;

  return (
    <>
      {!ended && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Ronde {room.round}</Badge>
            <span className="text-sm font-medium">{PHASE_LABEL[room.phase]}</span>
          </div>
          {remaining !== null && (
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-sm tabular-nums",
                remaining <= 10 && "font-semibold text-rose-500",
              )}
            >
              <Timer className="size-4" />
              {remaining}s
            </span>
          )}
        </div>
      )}

      {!ended && <SecretWordCard room={room} />}

      {room.phase === "description" && <TurnPanel room={room} remaining={remaining} />}

      {room.phase === "voting" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="font-medium">Waktunya voting! Siapa yang mencurigakan?</p>
            <p className="text-sm text-muted-foreground">
              {Object.keys(room.votes).length} / {room.players.filter((p) => p.alive).length} pemain sudah memilih
            </p>
            {canVote ? (
              <Button onClick={() => setVoteOpen(true)}>{room.votes[me!.id] ? "Ubah pilihan" : "Buka voting"}</Button>
            ) : (
              <p className="text-sm text-muted-foreground">Kamu sudah tereliminasi dan hanya bisa menonton.</p>
            )}
          </CardContent>
        </Card>
      )}

      {room.phase === "mr_white_guess" && room.mr_white_guesser !== room.me?.id && (
        <Card>
          <CardContent className="text-center">
            <p className="text-3xl" aria-hidden>
              🤔
            </p>
            <p className="font-medium">
              {room.players.find((p) => p.id === room.mr_white_guesser)?.name} adalah Mr. White!
            </p>
            <p className="text-sm text-muted-foreground">Dia sedang mencoba menebak kata Citizen…</p>
          </CardContent>
        </Card>
      )}

      <PlayersCard room={room} />
      <DescriptionBoard room={room} />

      <VoteDialog room={room} open={canVote && voteOpen} onOpenChange={setVoteOpen} remaining={remaining} />
      <MrWhiteGuessDialog room={room} remaining={remaining} />
    </>
  );
}

/** Kata rahasia disembunyikan secara default agar tidak terlihat orang di sebelah. */
function SecretWordCard({ room }: { room: RoomView }) {
  const [revealed, setRevealed] = useState(false);
  const me = room.players.find((p) => p.id === room.me?.id);
  const isMrWhite = room.me?.is_mr_white;

  return (
    <Card className={cn(!me?.alive && "opacity-70")}>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{isMrWhite ? "Peranmu" : "Kata rahasiamu"}</p>
          <p className={cn("truncate text-2xl font-bold transition", !revealed && "blur-md select-none")}>
            {isMrWhite ? "Anda adalah Mr. White" : (room.me?.word ?? "—")}
          </p>
          {isMrWhite && revealed && (
            <p className="text-xs text-muted-foreground">Kamu tidak mendapat kata. Dengarkan dan berbaurlah!</p>
          )}
          {!me?.alive && me?.role && (
            <p className="mt-1 text-xs text-muted-foreground">
              Kamu tereliminasi sebagai <b>{ROLE_LABEL[me.role]}</b>
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={revealed ? "Sembunyikan" : "Tampilkan"}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </CardContent>
    </Card>
  );
}

function TurnPanel({ room, remaining }: { room: RoomView; remaining: number | null }) {
  const current = room.players.find((p) => p.id === room.current_turn_player_id);
  const isMyTurn = room.current_turn_player_id === room.me?.id;

  return (
    <Card className={cn(isMyTurn && "ring-2 ring-primary")}>
      <CardContent className="space-y-3">
        {isMyTurn ? (
          // key: input dikosongkan setiap giliran baru.
          <DescriptionForm key={`${room.round}-${room.current_turn_index}`} remaining={remaining} />
        ) : (
          <div className="flex items-center gap-3">
            {current && <PlayerAvatar name={current.name} image={current.image} className="size-10" />}
            <div>
              <p className="text-xs text-muted-foreground">Sedang giliran</p>
              <p className="font-semibold">{current?.name ?? "—"}</p>
            </div>
          </div>
        )}

        <ol className="flex flex-wrap gap-1.5">
          {room.turn_order.map((id, i) => {
            const p = room.players.find((x) => x.id === id);
            if (!p) return null;
            const done = i < room.current_turn_index;
            const active = i === room.current_turn_index;
            return (
              <li
                key={id}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "text-muted-foreground",
                  !p.alive && "line-through opacity-50",
                )}
              >
                {done && <Check className="size-3" />}
                {i + 1}. {p.name}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function DescriptionForm({ remaining }: { remaining: number | null }) {
  const { emit } = useSocket();
  const [text, setText] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) emit("game:submit_description", { text });
      }}
    >
      <p className="font-semibold">Giliranmu! Beri satu petunjuk singkat.</p>
      <div className="flex gap-2">
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.DESCRIPTION_MAX_LENGTH}
          placeholder="Petunjuk kata/kalimat singkat"
          className="h-11"
        />
        <Button type="submit" className="h-11" disabled={!text.trim()}>
          Kirim
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ucapkan juga secara langsung ke teman-temanmu. Sisa waktu {remaining ?? "-"} detik.
      </p>
    </form>
  );
}

function PlayersCard({ room }: { room: RoomView }) {
  const voting = room.phase === "voting";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemain</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {room.players.map((p) => {
            const votes = room.vote_tally[p.id] ?? 0;
            return (
              <li
                key={p.id}
                className={cn("flex items-center gap-2 rounded-lg border p-2", !p.alive && "bg-muted/50 opacity-60")}
              >
                <PlayerAvatar name={p.name} image={p.image} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", !p.alive && "line-through")}>
                    {p.name}
                    {p.id === room.me?.id && " (kamu)"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {p.role && <span className={cn("rounded px-1 text-[10px]", ROLE_STYLE[p.role])}>{ROLE_LABEL[p.role]}</span>}
                    {voting && room.votes[p.id] && <span className="text-[10px] text-emerald-500">sudah vote</span>}
                  </div>
                </div>
                {!p.alive && <Skull className="size-4 shrink-0" aria-label="Tereliminasi" />}
                {p.alive && !p.connected && <WifiOff className="size-4 shrink-0 text-amber-500" aria-label="Terputus" />}
                {voting && votes > 0 && <Badge variant="destructive">{votes}</Badge>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function DescriptionBoard({ room }: { room: RoomView }) {
  const rounds = [...new Set(room.descriptions.map((d) => d.round))].sort((a, b) => b - a);
  if (rounds.length === 0) return null;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Petunjuk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rounds.map((round) => (
          <div key={round} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Ronde {round}</p>
            <ul className="space-y-1">
              {room.descriptions
                .filter((d) => d.round === round)
                .map((d, i) => (
                  <li key={`${d.player_id}-${i}`} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-medium">{nameOf(d.player_id)}:</span>
                    {d.skipped ? (
                      <span className="italic text-muted-foreground">(waktu habis)</span>
                    ) : (
                      <span className="break-words">{d.text}</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
