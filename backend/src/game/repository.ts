import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { game_histories, game_participants, word_banks } from "../db/schema";
import type { WordPair } from "./logic";
import { WIN_SCORE, type RoomState } from "./types";

export async function pickRandomWordPair(): Promise<WordPair> {
  const [row] = await db
    .select({ word_a: word_banks.word_a, word_b: word_banks.word_b, category: word_banks.category })
    .from(word_banks)
    .where(eq(word_banks.is_active, true))
    .orderBy(sql`random()`)
    .limit(1);
  if (!row) throw new Error("word_banks kosong. Jalankan `bun run db:seed` terlebih dahulu.");
  return row;
}

/** Menyimpan hasil game yang sudah selesai ke PostgreSQL. */
export async function saveGameHistory(state: RoomState): Promise<void> {
  if (state.phase !== "ended" || !state.started_at) return;
  const participants = state.players.filter((p) => p.role !== null);

  await db.transaction(async (tx) => {
    const [history] = await tx
      .insert(game_histories)
      .values({
        room_id: state.room_id,
        host_id: state.host_id,
        winner_role: state.winner_role,
        total_players: participants.length,
        started_at: new Date(state.started_at!),
        ended_at: state.ended_at ? new Date(state.ended_at) : new Date(),
      })
      .returning({ id: game_histories.id });

    if (participants.length === 0) return;
    await tx.insert(game_participants).values(
      participants.map((p) => {
        const isWinner = p.role === state.winner_role;
        return {
          game_history_id: history!.id,
          user_id: p.id,
          role_assigned: p.role!,
          is_winner: isWinner,
          score_earned: isWinner ? WIN_SCORE[p.role!] : 0,
        };
      }),
    );
  });
}

export async function getUserStats(userId: string) {
  const [row] = await db
    .select({
      games_played: sql<number>`count(*)::int`,
      games_won: sql<number>`count(*) filter (where ${game_participants.is_winner})::int`,
      total_score: sql<number>`coalesce(sum(${game_participants.score_earned}), 0)::int`,
    })
    .from(game_participants)
    .where(eq(game_participants.user_id, userId));
  return row ?? { games_played: 0, games_won: 0, total_score: 0 };
}
