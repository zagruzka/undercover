/**
 * Pesan sistem untuk chat room: pemisah ronde, log vote, hasil eliminasi.
 * Dihasilkan dengan membandingkan state sebelum & sesudah sebuah perubahan,
 * sehingga perubahan dari timer (bukan aksi pemain) juga tercatat.
 */
import { SKIP_VOTE, type GameRole, type RoomState } from "./types";

export interface LogEntry {
  kind: "system" | "round";
  text: string;
  round: number;
}

export interface Snapshot {
  phase: RoomState["phase"];
  round: number;
  eliminations: number;
  mr_white_guess: string | null;
}

const ROLE_LABEL: Record<GameRole, string> = {
  citizen: "Citizen",
  undercover: "Undercover",
  mr_white: "Mr. White",
};

export function snapshot(state: RoomState): Snapshot {
  return {
    phase: state.phase,
    round: state.round,
    eliminations: state.eliminations.length,
    mr_white_guess: state.mr_white_guess ? JSON.stringify(state.mr_white_guess) : null,
  };
}

function nameOf(state: RoomState, id: string | null): string {
  return state.players.find((p) => p.id === id)?.name ?? "?";
}

function tallyText(state: RoomState, tally: Record<string, number>): string {
  const parts = Object.entries(tally)
    .sort(([, a], [, b]) => b - a)
    .map(([id, n]) => `${id === SKIP_VOTE ? "Skip" : nameOf(state, id)} ${n}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

/** Log satu aksi vote; hanya dipakai saat vote_visibility = "show". */
export function voteLog(state: RoomState, voterId: string, targetId: string | null): LogEntry {
  const voter = nameOf(state, voterId);
  const text =
    targetId === null
      ? `${voter} membatalkan vote`
      : targetId === SKIP_VOTE
        ? `${voter} memilih skip`
        : targetId === voterId
          ? `${voter} vote dirinya sendiri`
          : `${voter} vote ${nameOf(state, targetId)}`;
  return { kind: "system", text, round: state.round };
}

export function describeChanges(prev: Snapshot, state: RoomState): LogEntry[] {
  const logs: LogEntry[] = [];
  const startedNow =
    (prev.phase === "lobby" || prev.phase === "ended") && (state.phase === "word_submit" || state.phase === "card_pick");
  if (startedNow) logs.push({ kind: "system", text: "Game baru dimulai!", round: 0 });

  for (const e of state.eliminations.slice(prev.eliminations)) {
    const tally = tallyText(state, e.tally ?? {});
    const text = e.tie
      ? `Voting seri, tidak ada yang tereliminasi${tally}`
      : e.skipped
        ? `Mayoritas skip, tidak ada yang tereliminasi${tally}`
        : `${nameOf(state, e.player_id)} tereliminasi, ternyata ${e.role ? ROLE_LABEL[e.role] : "?"}${tally}`;
    logs.push({ kind: "system", text, round: e.round });
  }

  const guess = state.mr_white_guess;
  if (guess && JSON.stringify(guess) !== prev.mr_white_guess) {
    const who = nameOf(state, guess.player_id);
    logs.push({
      kind: "system",
      text: guess.guess
        ? `${who} menebak "${guess.guess}": ${guess.correct ? "BENAR!" : "salah"}`
        : `${who} tidak menebak tepat waktu`,
      round: state.round,
    });
  }

  if (state.phase === "ended" && prev.phase !== "ended" && state.winner_role) {
    logs.push({ kind: "system", text: `${ROLE_LABEL[state.winner_role]} menang!`, round: state.round });
  } else if (state.round > prev.round && state.phase === "voting") {
    logs.push({ kind: "round", text: `Ronde ${state.round}`, round: state.round });
  }
  return logs;
}
