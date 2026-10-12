import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("game_role", ["citizen", "undercover", "mr_white"]);
export const difficultyEnum = pgEnum("word_difficulty", ["easy", "medium", "hard"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 64 }).notNull(),
    email: varchar("email", { length: 255 }).unique(),
    image: text("image"),
    is_guest: boolean("is_guest").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const word_banks = pgTable(
  "word_banks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    word_a: varchar("word_a", { length: 64 }).notNull(),
    word_b: varchar("word_b", { length: 64 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    difficulty: difficultyEnum("difficulty").notNull().default("medium"),
    is_active: boolean("is_active").notNull().default(true),
  },
  (t) => [index("word_banks_is_active_idx").on(t.is_active)],
);

export const game_histories = pgTable(
  "game_histories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    room_id: varchar("room_id", { length: 8 }).notNull(),
    host_id: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    winner_role: roleEnum("winner_role"),
    total_players: integer("total_players").notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("game_histories_room_id_idx").on(t.room_id)],
);

export const game_participants = pgTable(
  "game_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game_history_id: uuid("game_history_id")
      .notNull()
      .references(() => game_histories.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role_assigned: roleEnum("role_assigned").notNull(),
    is_winner: boolean("is_winner").notNull().default(false),
    score_earned: integer("score_earned").notNull().default(0),
  },
  (t) => [
    index("game_participants_game_history_id_idx").on(t.game_history_id),
    index("game_participants_user_id_idx").on(t.user_id),
  ],
);

export type User = typeof users.$inferSelect;
export type WordBank = typeof word_banks.$inferSelect;
export type GameRole = (typeof roleEnum.enumValues)[number];
