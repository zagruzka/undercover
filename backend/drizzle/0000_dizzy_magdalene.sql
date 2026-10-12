CREATE TYPE "public"."word_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."game_role" AS ENUM('citizen', 'undercover', 'mr_white');--> statement-breakpoint
CREATE TABLE "game_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar(8) NOT NULL,
	"host_id" uuid NOT NULL,
	"winner_role" "game_role",
	"total_players" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_history_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_assigned" "game_role" NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"score_earned" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"email" varchar(255),
	"image" text,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "word_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_a" varchar(64) NOT NULL,
	"word_b" varchar(64) NOT NULL,
	"category" varchar(64) NOT NULL,
	"difficulty" "word_difficulty" DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_histories" ADD CONSTRAINT "game_histories_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_game_history_id_game_histories_id_fk" FOREIGN KEY ("game_history_id") REFERENCES "public"."game_histories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_histories_room_id_idx" ON "game_histories" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "game_participants_game_history_id_idx" ON "game_participants" USING btree ("game_history_id");--> statement-breakpoint
CREATE INDEX "game_participants_user_id_idx" ON "game_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "word_banks_is_active_idx" ON "word_banks" USING btree ("is_active");