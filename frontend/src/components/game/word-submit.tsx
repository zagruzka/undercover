"use client";

import { Check, Hourglass, PenLine } from "lucide-react";
import { useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/** Mode kata sendiri: setiap pemain mengirim sepasang kata yang mirip. */
export function WordSubmit({ room }: { room: RoomView }) {
  const { emit } = useSocket();
  const submitted = room.me?.submitted_words ?? null;
  const [editing, setEditing] = useState(false);
  const [wordA, setWordA] = useState(submitted?.word_a ?? "");
  const [wordB, setWordB] = useState(submitted?.word_b ?? "");
  const count = room.word_submitted_ids.length;
  const showForm = !submitted || editing;
  const valid = wordA.trim() && wordB.trim() && wordA.trim().toLowerCase() !== wordB.trim().toLowerCase();

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-card/80 p-3">
        <h2 className="flex items-center gap-1.5 font-display text-lg font-bold">
          <PenLine className="size-5 text-primary" />
          Kirim 2 kata mirip
        </h2>
        <p className="text-sm text-muted-foreground">Satu pasangan akan dipilih acak. Rahasiakan!</p>

        {showForm ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              emit("game:submit_words", { word_a: wordA, word_b: wordB });
              setEditing(false);
            }}
          >
            <Input aria-label="Kata pertama" placeholder="Kopi" value={wordA} onChange={(e) => setWordA(e.target.value)} maxLength={LIMITS.WORD_MAX_LENGTH} autoComplete="off" className="h-10 font-semibold" />
            <Input aria-label="Kata kedua" placeholder="Teh" value={wordB} onChange={(e) => setWordB(e.target.value)} maxLength={LIMITS.WORD_MAX_LENGTH} autoComplete="off" className="h-10 font-semibold" />
            <Button type="submit" className="h-10" disabled={!valid}>
              Kirim
            </Button>
          </form>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2">
            <p className="truncate font-display font-bold">
              {submitted.word_a} <span className="text-muted-foreground">&</span> {submitted.word_b}
            </p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Ubah
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/80 p-3">
        <p className="mb-2 font-display font-bold">
          {count}/{room.players.length} sudah kirim
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {room.players.map((p) => {
            const done = room.word_submitted_ids.includes(p.id);
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold",
                  done ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : <Hourglass className="size-3.5 animate-pulse" />}
                {p.name}
              </li>
            );
          })}
        </ul>
        {room.me?.is_host && count > 0 && count < room.players.length && (
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => emit("game:force_word_start")}>
            Lanjut pakai {count} kata
          </Button>
        )}
      </section>
    </div>
  );
}
