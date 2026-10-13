"use client";

import { Check, Hourglass } from "lucide-react";
import { useState } from "react";
import { PlayerAvatar } from "@/components/game/player-avatar";
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
    <div className="space-y-4">
      <div className="rounded-3xl border-2 border-white/10 bg-card/80 p-5 shadow-lg">
        <h2 className="font-display text-3xl font-bold">✍️ Buat kata kalian!</h2>
        <p className="mt-1 text-base text-muted-foreground">
          Tulis 2 kata yang <b className="text-foreground">mirip tapi berbeda</b>. Sistem akan mengacak dan memilih satu
          pasangan dari semua pemain — jadi rahasiakan katamu!
        </p>

        {showForm ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              emit("game:submit_words", { word_a: wordA, word_b: wordB });
              setEditing(false);
            }}
          >
            <WordInput label="Kata pertama" placeholder="mis. Kopi" value={wordA} onChange={setWordA} />
            <WordInput label="Kata kedua (mirip)" placeholder="mis. Teh" value={wordB} onChange={setWordB} />
            <Button type="submit" size="lg" className="h-14 w-full font-display text-xl" disabled={!valid}>
              Kirim kata
            </Button>
          </form>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary p-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Kata kirimanmu</p>
              <p className="truncate font-display text-xl font-bold">
                {submitted.word_a} <span className="text-muted-foreground">&</span> {submitted.word_b}
              </p>
            </div>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Ubah
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-3xl border-2 border-white/10 bg-card/80 p-5 shadow-lg">
        <p className="font-display text-xl font-bold">
          {count}/{room.players.length} pemain sudah mengirim
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {room.players.map((p) => {
            const done = room.word_submitted_ids.includes(p.id);
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border-2 p-2",
                  done ? "border-emerald-400/60 bg-emerald-500/15" : "border-white/10",
                )}
              >
                <PlayerAvatar name={p.name} image={p.image} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                {done ? (
                  <Check className="size-5 text-emerald-400" strokeWidth={3} />
                ) : (
                  <Hourglass className="size-5 animate-pulse text-muted-foreground" />
                )}
              </li>
            );
          })}
        </ul>
        {room.me?.is_host && count > 0 && count < room.players.length && (
          <Button
            variant="secondary"
            size="lg"
            className="mt-4 h-12 w-full text-base"
            onClick={() => emit("game:force_word_start")}
          >
            Lanjut pakai {count} kata yang sudah masuk
          </Button>
        )}
      </div>
    </div>
  );
}

function WordInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-semibold">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={LIMITS.WORD_MAX_LENGTH}
        autoComplete="off"
        className="h-14 rounded-2xl text-xl font-semibold"
      />
    </label>
  );
}
