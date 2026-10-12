"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export function ChatPanel({ className }: { className?: string }) {
  const { chat, emit, room } = useSocket();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const myId = room?.me?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  return (
    <Card className={cn("flex min-h-72 flex-col", className)}>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        <div ref={listRef} className="max-h-72 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-none">
          {chat.length === 0 && <p className="text-center text-xs text-muted-foreground">Belum ada pesan.</p>}
          {chat.map((m) => {
            const mine = m.player_id === myId;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {!mine && <span className="text-[10px] text-muted-foreground">{m.name}</span>}
                <p
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.text}
                </p>
              </div>
            );
          })}
        </div>
        <form
          className="flex gap-2"
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
            placeholder="Tulis pesan…"
            aria-label="Pesan chat"
          />
          <Button type="submit" size="icon" aria-label="Kirim" disabled={!text.trim()}>
            <Send />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
