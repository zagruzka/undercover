"use client";

import { Check } from "lucide-react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { useSocket } from "@/components/socket-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export function VoteDialog({
  room,
  open,
  onOpenChange,
  remaining,
}: {
  room: RoomView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remaining: number | null;
}) {
  const { emit } = useSocket();
  const myId = room.me?.id;
  const myVote = myId ? room.votes[myId] : undefined;
  const alive = room.players.filter((p) => p.alive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Voting eliminasi</DialogTitle>
          <DialogDescription>
            Pilih pemain yang menurutmu Undercover atau Mr. White. Kamu bisa mengubah pilihan sebelum waktu habis
            {remaining !== null && ` (${remaining}s)`}.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {alive.map((p) => {
            const isMe = p.id === myId;
            const selected = myVote === p.id;
            const votes = room.vote_tally[p.id] ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={isMe}
                  onClick={() => emit("game:submit_vote", { target_id: p.id })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                    "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                    selected && "border-primary bg-primary/10",
                  )}
                >
                  <PlayerAvatar name={p.name} image={p.image} />
                  <span className="flex-1 font-medium">
                    {p.name}
                    {isMe && " (kamu)"}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{votes} suara</span>
                  {selected && <Check className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-center text-xs text-muted-foreground">
          {Object.keys(room.votes).length} / {alive.length} pemain sudah memilih
        </p>
      </DialogContent>
    </Dialog>
  );
}
