"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export function ChatPanel({ className, placeholder = "Tulis pesan…" }: { className?: string; placeholder?: string }) {
  const { chat, emit, room } = useSocket();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const myId = room?.me?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  return (
    <section className={cn("flex min-h-80 flex-col rounded-3xl border-2 border-white/10 bg-card/80 p-4 shadow-lg", className)}>
      <h2 className="mb-2 font-display text-xl font-bold">💬 Chat & Clue</h2>
      <div ref={listRef} className="max-h-80 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-none">
        {chat.length === 0 && (
          <p className="py-6 text-center text-base text-muted-foreground">Belum ada pesan. Tulis clue pertamamu!</p>
        )}
        {chat.map((m) => {
          const mine = m.player_id === myId;
          return (
            <div key={m.id} className={cn("flex animate-pop-in flex-col", mine ? "items-end" : "items-start")}>
              {!mine && <span className="px-2 text-sm font-bold text-primary">{m.name}</span>}
              <p
                className={cn(
                  "max-w-[85%] rounded-3xl px-4 py-2 text-lg break-words",
                  mine ? "rounded-br-md bg-primary font-semibold text-primary-foreground" : "rounded-bl-md bg-secondary",
                )}
              >
                {m.text}
              </p>
            </div>
          );
        })}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          emit("chat:send_message", { text });
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.CHAT_MAX_LENGTH}
          placeholder={placeholder}
          aria-label="Pesan chat"
          className="h-12 rounded-full px-4 text-lg"
        />
        <Button type="submit" size="icon-lg" className="size-12 rounded-full" aria-label="Kirim pesan" disabled={!text.trim()}>
          <Send className="size-5" />
        </Button>
      </form>
    </section>
  );
}
