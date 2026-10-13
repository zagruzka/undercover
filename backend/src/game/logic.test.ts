import { describe, expect, test } from "bun:test";
import { describeChanges, snapshot, voteLog } from "./chat-log";
import {
  addPlayer,
  cancelVote,
  cardIndexOf,
  checkWinner,
  createRoom,
  forceWordStart,
  handleTimeout,
  leaveRoom,
  pickCard,
  publicView,
  resolveVotes,
  startGame,
  submitMrWhiteGuess,
  submitVote,
  submitWords,
  updateSettings,
} from "./logic";
import { SKIP_VOTE, type GameRole, type RoomState, type Settings } from "./types";

const WORDS = { word_a: "Kopi", word_b: "Teh", category: "Minuman" };
const NOW = 1_000_000;

function lobby(count: number, settings: Partial<Settings>): RoomState {
  const state = createRoom("ABCDE", { id: "p0", name: "Host", image: null }, NOW);
  for (let i = 1; i < count; i++) addPlayer(state, { id: `p${i}`, name: `Pemain ${i}`, image: null });
  updateSettings(state, "p0", settings);
  return state;
}

/** Game mode bank kata, kartu sudah dibagikan tapi belum dipilih. */
function dealt(count: number, settings: Partial<Settings>): RoomState {
  const state = lobby(count, settings);
  startGame(state, "p0", WORDS, NOW);
  return state;
}

function assignRoles(state: RoomState, roles: GameRole[]): void {
  state.players.forEach((p, i) => (p.role = roles[i]!));
}

/** Semua pemain mengambil kartu sesuai urutan → masuk fase voting. */
function pickAll(state: RoomState): void {
  state.players.forEach((p, i) => pickCard(state, p.id, i, NOW));
}

function voting(count: number, settings: Partial<Settings>, roles?: GameRole[]): RoomState {
  const state = dealt(count, settings);
  if (roles) assignRoles(state, roles);
  pickAll(state);
  return state;
}

function voteAllFor(state: RoomState, targetId: string): void {
  const alive = state.players.filter((p) => p.alive);
  const fallback = alive.find((p) => p.id !== targetId)!.id;
  for (const p of alive) submitVote(state, p.id, p.id === targetId ? fallback : targetId, NOW);
}

describe("startGame", () => {
  test("membagi role sesuai pengaturan dan menyiapkan satu kartu per pemain", () => {
    const state = dealt(6, { undercover_count: 1, mr_white_count: 1 });
    const roles = state.players.map((p) => p.role);
    expect(roles.filter((r) => r === "undercover")).toHaveLength(1);
    expect(roles.filter((r) => r === "mr_white")).toHaveLength(1);
    expect(roles.filter((r) => r === "citizen")).toHaveLength(4);
    expect(state.phase).toBe("card_pick");
    expect(state.cards).toHaveLength(6);
    expect(state.cards.every((c) => c.owner_id === null)).toBe(true);
  });

  test("menolak komposisi role yang tidak valid", () => {
    expect(() => dealt(3, { undercover_count: 2, mr_white_count: 0 })).toThrow();
    expect(() => dealt(2, { undercover_count: 1, mr_white_count: 0 })).toThrow();
    expect(() => dealt(4, { undercover_count: 0, mr_white_count: 0 })).toThrow();
  });
});

describe("rebutan kartu", () => {
  test("kartu yang sudah diambil tidak bisa diambil pemain lain", () => {
    const state = dealt(4, { undercover_count: 1 });
    pickCard(state, "p1", 2, NOW);
    expect(() => pickCard(state, "p2", 2, NOW)).toThrow("Kartu sudah diambil");
    expect(state.cards[2]!.owner_id).toBe("p1");
  });

  test("satu pemain hanya bisa mengambil satu kartu", () => {
    const state = dealt(4, { undercover_count: 1 });
    pickCard(state, "p1", 0, NOW);
    expect(() => pickCard(state, "p1", 1, NOW)).toThrow("sudah memilih");
  });

  test("kata baru terlihat setelah pemain membuka kartunya", () => {
    const state = dealt(4, { undercover_count: 1 });
    assignRoles(state, ["citizen", "citizen", "citizen", "undercover"]);
    expect(publicView(state, "p3", NOW).me?.word).toBeNull();
    pickCard(state, "p3", 0, NOW);
    expect(publicView(state, "p3", NOW).me?.word).toBe("Teh");
    expect(publicView(state, "p0", NOW).cards[0]).toEqual({ index: 0, owner_id: "p3", role: null });
  });

  test("setelah semua kartu diambil langsung masuk voting dengan penanda clue pertama", () => {
    const state = voting(4, { undercover_count: 0, mr_white_count: 1 }, ["citizen", "citizen", "citizen", "mr_white"]);
    expect(state.phase).toBe("voting");
    expect(state.round).toBe(1);
    expect(state.first_clue_player_id).not.toBe("p3");
  });

  test("waktu habis membagikan sisa kartu secara acak", () => {
    const state = dealt(4, { undercover_count: 1 });
    pickCard(state, "p0", 1, NOW);
    expect(handleTimeout(state, state.deadline!)).toBe(true);
    expect(state.phase).toBe("voting");
    expect(new Set(state.players.map((p) => cardIndexOf(state, p.id))).size).toBe(4);
  });
});

describe("voting", () => {
  test("durasi 0 berarti voting tanpa batas waktu", () => {
    const state = voting(4, { undercover_count: 1, vote_duration: 0 });
    expect(state.deadline).toBeNull();
    expect(handleTimeout(state, NOW * 10)).toBe(false);
  });

  test("durasi voting > 0 merekap otomatis saat waktu habis", () => {
    const state = voting(4, { undercover_count: 1, vote_duration: 30 });
    expect(state.deadline).toBe(NOW + 30_000);
    submitVote(state, "p0", "p1", NOW);
    handleTimeout(state, state.deadline!);
    expect(state.players.find((p) => p.id === "p1")!.alive).toBe(false);
  });

  test("voting seri tidak mengeliminasi siapa pun dan memulai ronde baru", () => {
    const state = voting(4, { undercover_count: 1 });
    submitVote(state, "p0", "p1", NOW);
    submitVote(state, "p1", "p0", NOW);
    resolveVotes(state, NOW);
    expect(state.eliminations.at(-1)?.tie).toBe(true);
    expect(state.phase).toBe("voting");
    expect(state.round).toBe(2);
  });

  test("boleh vote diri sendiri, tapi tidak boleh vote pemain yang sudah mati", () => {
    const state = voting(5, { undercover_count: 1 }, ["citizen", "citizen", "citizen", "citizen", "undercover"]);
    submitVote(state, "p0", "p0", NOW);
    expect(state.votes.p0).toBe("p0");
    voteAllFor(state, "p1");
    expect(() => submitVote(state, "p0", "p1", NOW)).toThrow("sudah tereliminasi");
  });

  test("vote bisa dibatalkan sebelum semua pemain memilih", () => {
    const state = voting(4, { undercover_count: 1 });
    submitVote(state, "p0", "p1", NOW);
    cancelVote(state, "p0");
    expect(state.votes.p0).toBeUndefined();
    expect(() => cancelVote(state, "p0")).toThrow("belum vote");
  });

  test("mayoritas skip tidak mengeliminasi siapa pun", () => {
    const state = voting(4, { undercover_count: 1 });
    submitVote(state, "p0", SKIP_VOTE, NOW);
    submitVote(state, "p1", SKIP_VOTE, NOW);
    submitVote(state, "p2", "p3", NOW);
    submitVote(state, "p3", "p2", NOW);
    const last = state.eliminations.at(-1)!;
    expect(last.skipped).toBe(true);
    expect(last.tally).toEqual({ [SKIP_VOTE]: 2, p3: 1, p2: 1 });
    expect(state.players.every((p) => p.alive)).toBe(true);
    expect(state.round).toBe(2);
  });

  test("mode hide hanya memperlihatkan vote sendiri dan siapa yang sudah vote", () => {
    const state = voting(4, { undercover_count: 1, vote_visibility: "hide" });
    submitVote(state, "p0", "p1", NOW);
    submitVote(state, "p2", "p1", NOW);
    const view = publicView(state, "p0", NOW);
    expect(view.votes).toEqual({ p0: "p1" });
    expect(view.vote_tally).toEqual({});
    expect(view.voted_ids.sort()).toEqual(["p0", "p2"]);
    expect(publicView(state, "p3", NOW).votes).toEqual({});
  });
});

describe("kondisi kemenangan", () => {
  test("Citizen menang jika Undercover tereliminasi", () => {
    const state = voting(4, { undercover_count: 1 }, ["citizen", "citizen", "citizen", "undercover"]);
    voteAllFor(state, "p3");
    expect(state.winner_role).toBe("citizen");
  });

  test("Undercover menang jika jumlahnya >= Citizen tersisa", () => {
    const state = voting(3, { undercover_count: 1 }, ["citizen", "citizen", "undercover"]);
    voteAllFor(state, "p0");
    expect(state.winner_role).toBe("undercover");
  });

  test("Mr. White langsung menang jika tebakannya benar", () => {
    const state = voting(5, { undercover_count: 1, mr_white_count: 1 }, ["citizen", "citizen", "citizen", "undercover", "mr_white"]);
    voteAllFor(state, "p4");
    expect(state.phase).toBe("mr_white_guess");
    submitMrWhiteGuess(state, "p4", "  KOPI ", NOW);
    expect(state.winner_role).toBe("mr_white");
  });

  test("tebakan Mr. White yang salah melanjutkan ke ronde voting berikutnya", () => {
    const state = voting(5, { undercover_count: 1, mr_white_count: 1 }, ["citizen", "citizen", "citizen", "undercover", "mr_white"]);
    voteAllFor(state, "p4");
    submitMrWhiteGuess(state, "p4", "Teh", NOW);
    expect(state.phase).toBe("voting");
    expect(state.round).toBe(2);
  });

  test("Mr. White menang jika menjadi 2 pemain terakhir", () => {
    const state = voting(3, { mr_white_count: 1, undercover_count: 0 }, ["citizen", "citizen", "mr_white"]);
    voteAllFor(state, "p0");
    expect(state.winner_role).toBe("mr_white");
  });

  test("checkWinner null selama game masih berjalan", () => {
    expect(checkWinner(voting(5, { undercover_count: 1, mr_white_count: 1 }))).toBeNull();
  });
});

describe("mode kata sendiri", () => {
  test("start masuk fase kirim kata, lalu kartu dibagikan setelah semua mengirim", () => {
    const state = lobby(3, { undercover_count: 1, word_mode: "custom" });
    startGame(state, "p0", null, NOW);
    expect(state.phase).toBe("word_submit");
    submitWords(state, "p0", "Apel", "Pir", NOW);
    submitWords(state, "p1", "Laut", "Danau", NOW);
    expect(state.phase).toBe("word_submit");
    expect(publicView(state, "p2", NOW).word_submitted_ids).toEqual(["p0", "p1"]);
    submitWords(state, "p2", "Pena", "Pensil", NOW);
    expect(state.phase).toBe("card_pick");
    const pair = [state.word_a, state.word_b].sort();
    expect([["Apel", "Pir"], ["Danau", "Laut"], ["Pena", "Pensil"]]).toContainEqual(pair as string[]);
  });

  test("kata yang dikirim tidak bocor ke pemain lain", () => {
    const state = lobby(3, { undercover_count: 1, word_mode: "custom" });
    startGame(state, "p0", null, NOW);
    submitWords(state, "p0", "Apel", "Pir", NOW);
    expect(JSON.stringify(publicView(state, "p1", NOW))).not.toContain("Apel");
  });

  test("penyumbang kata yang terpilih tidak pernah menjadi Mr. White", () => {
    for (let i = 0; i < 50; i++) {
      const state = lobby(4, { undercover_count: 0, mr_white_count: 1, word_mode: "custom" });
      startGame(state, "p0", null, NOW);
      submitWords(state, "p1", "Apel", "Pir", NOW);
      forceWordStart(state, "p0", NOW);
      expect(state.word_author_id).toBe("p1");
      expect(state.players.find((p) => p.id === "p1")!.role).not.toBe("mr_white");
    }
  });

  test("validasi kata", () => {
    const state = lobby(3, { undercover_count: 1, word_mode: "custom" });
    startGame(state, "p0", null, NOW);
    expect(() => submitWords(state, "p0", "Apel", " apel ", NOW)).toThrow("berbeda");
    expect(() => submitWords(state, "p0", "", "Pir", NOW)).toThrow("wajib");
    expect(() => forceWordStart(state, "p0", NOW)).toThrow("Belum ada");
    expect(() => forceWordStart(state, "p1", NOW)).toThrow("host");
  });

  test("pemain keluar saat kirim kata hingga pemain kurang → kembali ke lobby", () => {
    const state = lobby(3, { undercover_count: 1, word_mode: "custom" });
    startGame(state, "p0", null, NOW);
    leaveRoom(state, "p2", NOW);
    expect(state.phase).toBe("lobby");
    expect(state.players).toHaveLength(2);
  });
});

describe("leaveRoom", () => {
  test("pemain keluar sebelum mengambil kartu mendapat kartu sisa dan tereliminasi", () => {
    const state = dealt(5, { undercover_count: 1 });
    assignRoles(state, ["citizen", "citizen", "citizen", "citizen", "undercover"]);
    pickCard(state, "p0", 0, NOW);
    leaveRoom(state, "p1", NOW);
    expect(cardIndexOf(state, "p1")).not.toBeNull();
    expect(state.players.find((p) => p.id === "p1")!.alive).toBe(false);
    expect(state.phase).toBe("card_pick");
  });

  test("host keluar di lobby memindahkan host", () => {
    const state = lobby(2, {});
    leaveRoom(state, "p0", NOW);
    expect(state.host_id).toBe("p1");
  });
});

describe("log chat", () => {
  test("eliminasi, rekap suara, dan pemisah ronde baru", () => {
    const state = voting(5, { undercover_count: 1 }, ["citizen", "citizen", "citizen", "citizen", "undercover"]);
    const prev = snapshot(state);
    voteAllFor(state, "p1");
    const logs = describeChanges(prev, state);
    expect(logs.map((l) => l.kind)).toEqual(["system", "round"]);
    expect(logs[0]!.text).toBe("Pemain 1 tereliminasi, ternyata Citizen (Pemain 1 4 · Host 1)");
    expect(logs[1]).toEqual({ kind: "round", text: "Ronde 2", round: 2 });
  });

  test("log vote membedakan vote, skip, diri sendiri, dan batal", () => {
    const state = voting(3, { undercover_count: 1 });
    expect(voteLog(state, "p0", "p1").text).toBe("Host vote Pemain 1");
    expect(voteLog(state, "p0", SKIP_VOTE).text).toBe("Host memilih skip");
    expect(voteLog(state, "p0", "p0").text).toBe("Host vote dirinya sendiri");
    expect(voteLog(state, "p0", null).text).toBe("Host membatalkan vote");
  });

  test("kemenangan dicatat tanpa pemisah ronde", () => {
    const state = voting(4, { undercover_count: 1 }, ["citizen", "citizen", "citizen", "undercover"]);
    const prev = snapshot(state);
    voteAllFor(state, "p3");
    expect(describeChanges(prev, state).map((l) => l.text)).toEqual([
      "Pemain 3 tereliminasi, ternyata Undercover (Pemain 3 3 · Host 1)",
      "Citizen menang!",
    ]);
  });
});
