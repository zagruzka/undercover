"use client";

import { Ghost } from "lucide-react";
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
        className="sm:max-w-xs"
      >
        <DialogHeader className="items-center text-center">
          <Ghost className="size-10 text-primary" />
          <DialogTitle className="font-display text-xl">Kamu ketahuan!</DialogTitle>
          <DialogDescription>
            Tebak kata Citizen. Benar = langsung menang.{remaining !== null && ` (${remaining}s)`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (guess.trim()) emit("game:mr_white_guess", { guess });
          }}
        >
          <Input autoFocus value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Tebakan…" maxLength={64} className="h-10" />
          <Button type="submit" className="h-10" disabled={!guess.trim()}>
            Tebak
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
