Anda adalah seorang Senior Full-Stack Engineer.
Tolong buatkan aplikasi game online realtime berbasis web untuk permainan kata sosial "Undercover" dengan arsitektur **Decoupled (Frontend & Backend terpisah)**. Game ini dimainkan secara TATAP MUKA (face-to-face) di mana setiap pemain mengakses web dari perangkat masing-masing.

### 1. TECH STACK & ARSITEKTUR
- **Frontend:** Next.js (App Router, Tailwind CSS, Shadcn UI) - *Mobile-first responsive layout*
- **Backend:** Bun + Elysia.js (High-performance web framework dengan *native WebSocket support*)
- **Database Utama:** PostgreSQL
- **ORM:** Drizzle ORM (Semua penamaan kolom tabel wajib menggunakan gaya **snake_case**)
- **In-Memory Store (Game State):** Redis (menggunakan ioredis/Bun redis client untuk mengelola status room & turn secara realtime)
- **Auth:** NextAuth.js di Frontend, berintegrasi dengan API Elysia.js (Mendukung Login Google & Guest Session via input nama).

### 2. ATURAN & ROLE GAME
1. **Citizen (Warga):** Mendapatkan kata rahasia A.
2. **Undercover (Penyamar):** Mendapatkan kata rahasia B yang sepadan dengan kata A.
3. **Mr. White:** Tidak mendapatkan kata sama sekali (hanya menerima teks "Anda adalah Mr. White").
4. **Alur Permainan:**
   - **Authentication / Entry:** Player Login Google atau masuk sebagai Guest (cukup input `player_name`).
   - **Lobby Room:** Host membuat room (kode unik 4-6 karakter), mengatur jumlah role, dan durasi turn.
   - **Fase Deskripsi (Turn-based):** Setiap pemain memberikan 1 petunjuk kata/kalimat singkat bergiliran via WebSocket.
   - **Fase Voting:** Setelah semua pemain berbicara, sistem membuka voting realtime untuk mengeliminasi pemain.
   - **Mekanisme Tebakan Mr. White:** Jika Mr. White tereliminasi, muncul modal agar dia menebak kata rahasia Citizen. Jika benar, Mr. White LANGSUNG MENANG.
   - **Kondisi Kemenangan:**
     * Citizen menang jika semua Undercover & Mr. White tereliminasi.
     * Undercover menang jika jumlah Undercover >= jumlah Citizen yang tersisa.
     * Mr. White menang jika tebakannya benar saat tereliminasi ATAU menjadi 2 pemain terakhir.

### 3. SKEMA DATABASE (PostgreSQL + Drizzle ORM - Snake Case)
Buat migrasi/skema Drizzle dengan konvensi `snake_case` untuk:
1. `users`: `id`, `name`, `email`, `image`, `is_guest` (boolean), `created_at`.
2. `word_banks`: `id`, `word_a`, `word_b`, `category`, `difficulty`, `is_active` (boolean).
3. `game_histories`: `id`, `room_id`, `host_id`, `winner_role`, `total_players`, `started_at`, `ended_at`.
4. `game_participants`: `id`, `game_history_id`, `user_id`, `role_assigned`, `is_winner`, `score_earned`.

### 4. BACKEND ARCHITECTURE (Bun + Elysia.js + WebSocket + Redis)
- Gunakan fitur `app.ws()` bawaan Elysia.js untuk menangani koneksi WebSocket secara *native* dan efisien.
- Simpan *in-memory game state* di Redis dengan key `room:{room_id}` (berisi data: players, current_turn_index, phase, word_a, word_b, votes).
- Event WebSocket yang harus di-handle di Elysia:
  - `room:create`, `room:join`, `room:leave`
  - `game:start` (Randomize kata dari PostgreSQL, assign role tersembunyi, set state ke Redis)
  - `game:submit_description` (Kirim petunjuk & pindah turn)
  - `game:submit_vote` (Rekap vote realtime)
  - `game:mr_white_guess` (Validasi tebakan Mr. White)
  - `chat:send_message` (Realtime room chat)

### 5. OUTPUT YANG DIHARAPKAN
1. **Struktur Direktori Monorepo / Multi-Folder:** Terpisah jelas antara folder `frontend` (Next.js) dan `backend` (Bun + Elysia).
2. **Backend (Bun + Elysia):**
   - Skema Drizzle ORM lengkap dengan penamaan `snake_case`.
   - Setup koneksi PostgreSQL, Redis, dan Elysia WebSocket server.
   - Logika penanganan *event* permainan.
   - Seeder awal untuk tabel `word_banks` (minimal 20 pasang kata bahasa Indonesia).
3. **Frontend (Next.js):**
   - Halaman Login / Guest.
   - Room Lobby & Host Settings.
   - In-Game HUD (Indikator turn, kata rahasia, chat, modal voting, dan tebakan Mr. White) yang terhubung ke WebSocket Elysia.
4. **Instruksi Jalankan:** Perintah terminal untuk menjalankan backend (`bun run dev`) dan frontend secara lokal.
