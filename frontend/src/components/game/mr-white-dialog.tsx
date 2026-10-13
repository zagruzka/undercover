"use client";

import { useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RoomView } from "@/lib/game-types";

/** Modal wajib untuk Mr. White yang baru tereliminasi: tebak kata Citizen untuk menang. */
export function MrWhiteGuessDialog({ room, remaining }: { room: RoomView; remaining: number | null }) {
  const { emit } = useSocket();
  const [guess, setGuess] = useState("");
  const open = room.phase === "mr_white_guess" && room.mr_white_guesser === room.me?.id;

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="border-4 border-white/20 text-center"
      >
        <DialogHeader className="items-center text-center">
          <span className="text-6xl" aria-hidden>
            👻
          </span>
          <DialogTitle className="font-display text-3xl">Kamu ketahuan!</DialogTitle>
          <DialogDescription className="text-base">
            Tebak kata rahasia Citizen. Kalau benar, kamu <b>langsung menang!</b>
          </DialogDescription>
        </DialogHeader>
        {remaining !== null && <p className="font-display text-4xl font-bold text-primary tabular-nums">{remaining}</p>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (guess.trim()) emit("game:mr_white_guess", { guess });
          }}
        >
          <Input
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Tebakan kata…"
            maxLength={64}
            className="h-14 rounded-2xl text-center text-xl font-semibold"
          />
          <Button type="submit" size="lg" className="h-14 w-full font-display text-xl" disabled={!guess.trim()}>
            Tebak!
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
