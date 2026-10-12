import { describe, expect, test } from "bun:test";
import {
  addPlayer,
  checkWinner,
  createRoom,
  handleTimeout,
  leaveRoom,
  publicView,
  resolveVotes,
  startGame,
  submitDescription,
  submitMrWhiteGuess,
  submitVote,
  updateSettings,
} from "./logic";
import type { GameRole, RoomState } from "./types";

const WORDS = { word_a: "Kopi", word_b: "Teh", category: "Minuman" };
const NOW = 1_000_000;

function setup(count: number, settings: { undercover_count: number; mr_white_count: number }): RoomState {
  const state = createRoom("ABCDE", { id: "p0", name: "Host", image: null }, NOW);
  for (let i = 1; i < count; i++) addPlayer(state, { id: `p${i}`, name: `Pemain ${i}`, image: null });
  updateSettings(state, "p0", settings);
  startGame(state, "p0", WORDS, NOW);
  return state;
}

function assignRoles(state: RoomState, roles: GameRole[]): void {
  state.players.forEach((p, i) => (p.role = roles[i]!));
}

function describeAll(state: RoomState): void {
  while (state.phase === "description") {
    submitDescription(state, state.turn_order[state.current_turn_index]!, "petunjuk", NOW);
  }
}

function voteAllFor(state: RoomState, targetId: string): void {
  const alive = state.players.filter((p) => p.alive);
  const fallback = alive.find((p) => p.id !== targetId)!.id;
  for (const p of alive) submitVote(state, p.id, p.id === targetId ? fallback : targetId, NOW);
}

describe("startGame", () => {
  test("membagi role sesuai pengaturan", () => {
    const state = setup(6, { undercover_count: 1, mr_white_count: 1 });
    const roles = state.players.map((p) => p.role);
    expect(roles.filter((r) => r === "undercover")).toHaveLength(1);
    expect(roles.filter((r) => r === "mr_white")).toHaveLength(1);
    expect(roles.filter((r) => r === "citizen")).toHaveLength(4);
    expect(state.phase).toBe("description");
    expect(state.round).toBe(1);
  });

  test("Mr. White tidak mendapat giliran pertama", () => {
    for (let i = 0; i < 30; i++) {
      const state = setup(4, { undercover_count: 0, mr_white_count: 1 });
      const first = state.players.find((p) => p.id === state.turn_order[0])!;
      expect(first.role).not.toBe("mr_white");
    }
  });

  test("menolak komposisi role yang tidak valid", () => {
    expect(() => setup(3, { undercover_count: 2, mr_white_count: 0 })).toThrow();
    expect(() => setup(2, { undercover_count: 1, mr_white_count: 0 })).toThrow();
    expect(() => setup(4, { undercover_count: 0, mr_white_count: 0 })).toThrow();
  });
});

describe("fase deskripsi", () => {
  test("hanya pemain yang sedang giliran yang bisa memberi petunjuk", () => {
    const state = setup(4, { undercover_count: 1, mr_white_count: 0 });
    const notCurrent = state.turn_order[1]!;
    expect(() => submitDescription(state, notCurrent, "halo", NOW)).toThrow("Belum giliranmu");
  });

  test("petunjuk tidak boleh berupa kata rahasia", () => {
    const state = setup(4, { undercover_count: 1, mr_white_count: 0 });
    expect(() => submitDescription(state, state.turn_order[0]!, " kopi ", NOW)).toThrow();
  });

  test("timeout melewati giliran, lalu masuk voting setelah semua giliran", () => {
    const state = setup(3, { undercover_count: 1, mr_white_count: 0 });
    for (let i = 0; i < 3; i++) expect(handleTimeout(state, state.deadline!)).toBe(true);
    expect(state.phase).toBe("voting");
    expect(state.descriptions.every((d) => d.skipped)).toBe(true);
  });
});

describe("voting & kondisi kemenangan", () => {
  test("Citizen menang jika Undercover tereliminasi", () => {
    const state = setup(4, { undercover_count: 1, mr_white_count: 0 });
    assignRoles(state, ["citizen", "citizen", "citizen", "undercover"]);
    describeAll(state);
    voteAllFor(state, "p3");
    expect(state.phase).toBe("ended");
    expect(state.winner_role).toBe("citizen");
  });

  test("Undercover menang jika jumlahnya >= Citizen tersisa", () => {
    const state = setup(3, { undercover_count: 1, mr_white_count: 0 });
    assignRoles(state, ["citizen", "citizen", "undercover"]);
    describeAll(state);
    voteAllFor(state, "p0");
    expect(state.winner_role).toBe("undercover");
  });

  test("voting seri tidak mengeliminasi siapa pun dan memulai ronde baru", () => {
    const state = setup(4, { undercover_count: 1, mr_white_count: 0 });
    describeAll(state);
    submitVote(state, "p0", "p1", NOW);
    submitVote(state, "p1", "p0", NOW);
    resolveVotes(state, NOW);
    expect(state.eliminations.at(-1)?.tie).toBe(true);
    expect(state.phase).toBe("description");
    expect(state.round).toBe(2);
  });

  test("tidak bisa memilih diri sendiri", () => {
    const state = setup(3, { undercover_count: 1, mr_white_count: 0 });
    describeAll(state);
    expect(() => submitVote(state, "p0", "p0", NOW)).toThrow();
  });
});

describe("Mr. White", () => {
  test("langsung menang jika tebakan benar saat tereliminasi", () => {
    const state = setup(5, { undercover_count: 1, mr_white_count: 1 });
    assignRoles(state, ["citizen", "citizen", "citizen", "undercover", "mr_white"]);
    describeAll(state);
    voteAllFor(state, "p4");
    expect(state.phase).toBe("mr_white_guess");
    submitMrWhiteGuess(state, "p4", "  KOPI ", NOW);
    expect(state.phase).toBe("ended");
    expect(state.winner_role).toBe("mr_white");
  });

  test("tebakan salah melanjutkan permainan", () => {
    const state = setup(5, { undercover_count: 1, mr_white_count: 1 });
    assignRoles(state, ["citizen", "citizen", "citizen", "undercover", "mr_white"]);
    describeAll(state);
    voteAllFor(state, "p4");
    submitMrWhiteGuess(state, "p4", "Teh", NOW);
    expect(state.phase).toBe("description");
    expect(state.mr_white_guess?.correct).toBe(false);
  });

  test("menang jika menjadi 2 pemain terakhir", () => {
    const state = setup(3, { undercover_count: 0, mr_white_count: 1 });
    assignRoles(state, ["citizen", "citizen", "mr_white"]);
    describeAll(state);
    voteAllFor(state, "p0");
    expect(state.winner_role).toBe("mr_white");
  });

  test("checkWinner mengembalikan null selama game masih berjalan", () => {
    const state = setup(5, { undercover_count: 1, mr_white_count: 1 });
    expect(checkWinner(state)).toBeNull();
  });
});

describe("publicView", () => {
  test("menyembunyikan role dan kata pemain lain", () => {
    const state = setup(4, { undercover_count: 1, mr_white_count: 0 });
    assignRoles(state, ["citizen", "citizen", "citizen", "undercover"]);
    const view = publicView(state, "p3", NOW);
    expect(view.me?.word).toBe("Teh");
    expect(view.word_a).toBeNull();
    expect(view.players.every((p) => p.role === null)).toBe(true);
  });

  test("Mr. White tahu dirinya Mr. White tanpa kata", () => {
    const state = setup(4, { undercover_count: 0, mr_white_count: 1 });
    assignRoles(state, ["citizen", "citizen", "citizen", "mr_white"]);
    const view = publicView(state, "p3", NOW);
    expect(view.me?.is_mr_white).toBe(true);
    expect(view.me?.word).toBeNull();
  });
});

describe("leaveRoom", () => {
  test("pemain keluar saat gilirannya, giliran berpindah", () => {
    const state = setup(5, { undercover_count: 1, mr_white_count: 0 });
    assignRoles(state, ["citizen", "citizen", "citizen", "citizen", "undercover"]);
    const current = state.turn_order[0]!;
    const leaver = current === "p4" ? state.turn_order[1]! : current;
    if (leaver !== current) submitDescription(state, current, "petunjuk", NOW);
    leaveRoom(state, leaver, NOW);
    expect(state.players.find((p) => p.id === leaver)?.alive).toBe(false);
    expect(state.turn_order[state.current_turn_index]).not.toBe(leaver);
  });

  test("host keluar di lobby memindahkan host", () => {
    const state = createRoom("ABCDE", { id: "p0", name: "Host", image: null }, NOW);
    addPlayer(state, { id: "p1", name: "B", image: null });
    leaveRoom(state, "p0", NOW);
    expect(state.host_id).toBe("p1");
  });
});
