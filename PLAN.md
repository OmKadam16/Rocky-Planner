# Rocky: Build Plan (v2)

Rocky is a voice-first student planner with a private "memory". You talk to it (laptop mic or phone mic) and it changes your calendar. It also remembers what you read and searched, and answers "what was I searching on Wednesday?".

**Hard rule: one AI path, fully local.** The AI (speech-to-text, language model, memory) runs on the user's laptop. No cloud AI API. The only cloud piece is Supabase, used as a login + message relay + calendar store. Memory data never leaves the laptop.

**Built from scratch.** Clarity (an earlier student app by the same author, https://github.com/OmKadam16/class_plan-inator) is only a **feature checklist**: no code, schema or files are copied from it. Stack: React + Vite + TypeScript + Tailwind v4 + React Router + Supabase.

---

## 0. Blockers and unknowns (resolve first)

| # | Item | Owner | Status |
|---|------|-------|--------|
| B1 | Hackathon rules on pre-built code. **Resolved: code may be written before the event** (Om confirmed). Building from scratch, so nothing needs disclosing. | Om | DONE |
| B2 | Laptop RAM / GPU / OS (decides model size and speed). | Om | UNKNOWN |
| B3 | Qwen3.5 4B vs 2B real speed + JSON validity on that laptop (Phase 0, spike 1). | agent | TODO |
| B4 | Ollama accepts audio input for Gemma 4 E2B/E4B? (optional experiment only). | agent | UNKNOWN |
| B5 | Free Supabase project created and Google sign-in enabled (only Om can do this). | Om | TODO |

## 1. Decisions (locked)

- **LLM:** `qwen3.5:4b` via Ollama. Fallback `qwen3.5:2b`. Chosen by env var `ROCKY_LLM`. Reason: best agentic / instruction scores found under ~4 GB (model-card numbers: 4B BFCL-V4 50.3, TAU2 79.9, IFEval 89.8). Thinking mode OFF (`"think": false`), temperature 0.1.
- **Structured output, not native tool calling.** Always call Ollama with a JSON schema in `format`. Native tool calling is fragile in small models.
- **LLM only extracts intent JSON.** All date math, conflict detection and rescheduling is deterministic TypeScript (the scheduler). The LLM never computes times.
- **Speech-to-text:** Whisper via `faster-whisper` (model `small.en`, fallback `base.en`) as a local HTTP sidecar. Gemma audio is an optional experiment, not the plan.
- **Text-to-speech:** browser `speechSynthesis` on the device that is speaking (phone or laptop). No ElevenLabs/OpenAI API. (Reconsider only if Om says otherwise.)
- **Sync + auth + relay:** Supabase (Google login, Postgres, Realtime, Storage). Same account on laptop and phone. Works from anywhere, not just same Wi-Fi.
- **Phone:** hosted web app (PWA, HTTPS so the mic works). Shows the **calendar only** + a big talk button. No classes, tasks, memory or settings.
- **Laptop:** full app + the "brain" process.
- **Memory:** local only on the laptop (SQLite + full-text + embeddings). Fed by a Chrome extension.
- **No Pomodoro / focus timer** anywhere in the product.

## 2. Architecture

```
PHONE (hosted PWA)                    SUPABASE (cloud relay)                LAPTOP
mic -> MediaRecorder  --upload-->  storage: voice-clips   <--subscribe--  brain (Node/TS)
"On it" ack plays locally          table: commands  (Realtime)              |- STT sidecar (faster-whisper)
calendar view (Realtime)  <--------table: events/tasks/...-------write-----  |- Ollama (qwen3.5)
speaks reply (speechSynthesis) <---commands.reply_text----------------------  |- scheduler (pure TS)
                                    table: devices (heartbeat, pairing)      |- memory (SQLite) <- Chrome extension
                                                                             full web app (localhost or hosted)
```

Laptop talking directly skips the phone steps: laptop web app records audio and posts a `commands` row (source `laptop`) the same way. One code path.

Flow of one command: record -> upload clip -> insert `commands` row (`queued`) -> brain picks it up (`transcribing` -> `thinking`) -> STT -> fast-path rules else Ollama intent JSON -> scheduler -> write events -> update row (`done`, `reply_text`, `diff`) -> phone/laptop speak reply and calendar updates live.

If the laptop is off, rows stay `queued`; the phone shows "Rocky's laptop is offline" (based on `devices.last_seen` older than 45 s).

### Repo layout (npm workspaces monorepo)

```
rocky/
  AGENTS.md  CLAUDE.md  PLAN.md
  supabase/migrations/        # 0001+ (schema in sections 3 and 6)
  packages/core/              # shared, no React, no Node-only APIs
    src/types.ts  intentSchema.ts  scheduler/  recurrence/  api/ (supabase data functions)
  apps/web/                   # Vite + React + TS + Tailwind v4 (laptop app + /remote phone view)
  apps/brain/                 # laptop background process (Node + TypeScript)
    src/index.ts  relay.ts  stt.ts  llm.ts  fastpath.ts  memory/  heartbeat.ts
    stt-sidecar/              # Python: faster-whisper FastAPI (POST /transcribe)
  apps/extension/             # Chrome MV3 memory capture
```

## 3. Product scope and data model (built from scratch)

Clarity is the feature checklist only. Do not copy or port its code. Rebuild each feature to this spec and the designs in `design/`.

**Scope tiers (time is limited; build in this order)**
- **P0 (the demo):** auth (Google + email), pairing, laptop voice bar, phone calendar + talk button, day + week calendar with fixed vs flexible blocks, drag/resize on laptop, voice commands that add/move/cancel/shift/undo, Dashboard (today timeline, due soon, tasks, recent commands), Memory.
- **P1:** classes with weekly schedules (become fixed blocks), assignments (status + due date), tasks (per day), fixed commitments (work, club), setup wizard, Settings (profile, About you, Voice, AI, Devices, theme).
- **P2:** month view, semester filter and sorting on Classes, due-date reminder notifications, forgot/reset password polish, keyboard shortcuts sheet.

**Features to include (checklist from Clarity, minus Pomodoro)**
Auth (email, Google, confirm, reset). Onboarding (profile, personality chips, classes). Dashboard (due soon with status menu, weekly outlook, today's tasks). Classes (name, professor, category, code, semester, schedule, next assignment, progress) and assignments (title, class, status todo / in_progress / done, due date + time). Calendar (month / week / day, drag to move, resize with 15-minute snap, create by double-click, recurring daily/weekly with chosen days and end date, edit "this event / whole series", skip or override one date). **Fixed classes** (a class schedule generates a locked recurring block). **Fixed commitments** (any non-class event can be marked fixed). Day task checklist. Settings (profile, About you, theme, reminders).

**Data model (Postgres on Supabase; every table has `user_id uuid references auth.users` and RLS `user_id = auth.uid()`)**
Times are **minutes since midnight** (`start_min` 0-1439, `end_min` 1-1440 so an event can end at midnight; nothing crosses midnight) plus a `date`, in the user's local time. Weekdays are 0 = Sunday.

```sql
profiles(user_id pk, full_name, display_name, school, program, year, traits text[], hobbies text[],
         study_styles text[], about_me, theme text default 'system', due_date_reminders bool default true,
         wake_min int default 420, sleep_min int default 1380, timezone text, created_at)
classes(id, user_id, name, professor, category, code, semester, starts_on date, ends_on date,
        start_min int, end_min int, meeting_days int[], created_at)
assignments(id, user_id, class_id null, title, status text default 'todo', due_at timestamptz, created_at)
tasks(id, user_id, title, task_date date, done bool default false, class_id null, position int, created_at)
events(id, user_id, title, subtitle, kind text,        -- class | commitment | study | personal | break
       event_date date, start_min int, end_min int,
       fixed bool default false, priority text default 'med', travel_min int default 0,
       class_id null,                                   -- set for blocks generated from a class
       repeat_freq text default 'none',                 -- none | daily | weekly
       repeat_days int[], repeat_until date, created_at)
event_exceptions(id, user_id, event_id, occurrence_date date,
       kind text,                                       -- skip | move
       new_date date, new_start_min int, new_end_min int, created_at)
```
- A recurring event is **one row** plus exceptions. `expandEvents(events, exceptions, from, to)` in `packages/core` returns dated occurrences with id `${eventId}:${occurrenceDate}` and applies skips/moves. Unit-test it heavily; the scheduler depends on it. One exception per occurrence (`unique (event_id, occurrence_date)`).
- **Class sync is a DB trigger** (`sync_class_event` in `0001_core_schema.sql`): inserting/updating a class upserts its event; clearing the schedule deletes it; deleting the class cascades to its event and assignments. Clients only write `classes`.
- `user_id` defaults to `auth.uid()` on every table, so clients can omit it.
- Creating / editing / deleting a class creates / updates / deletes its linked event (`class_id`, `kind = 'class'`, `fixed = true`, weekly, `repeat_days = meeting_days`, `repeat_until = ends_on`). Deleting a class also deletes its assignments.
- Fixed events cannot be dragged or edited from the calendar (class blocks open a read-only popover with "Edit class"); Rocky never moves them.
- `devices` and `commands` tables are in section 6.

**Routing and hosting:** `BrowserRouter` (no hash routes) with a single-page-app fallback; host the web app as a **Render Static Site** (free, HTTPS included; static sites do not spin down, so no keep-alive pinger is needed). Render settings: build command `npm ci && npm run build -w apps/web`, publish directory `apps/web/dist`, a rewrite rule `/*` to `/index.html` (Render dashboard > Redirects/Rewrites), and build-time env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do not deploy the app as a Render web service. Supabase client uses `flowType: 'pkce'` for Google sign-in. Auth redirect URLs must include the Render URL (`https://<name>.onrender.com`) and `http://localhost:5173`.

**UI libraries:** `react-router`, `@supabase/supabase-js`, `lucide-react`, `qrcode.react` (QR), `@fontsource/plus-jakarta-sans` + `@fontsource/jetbrains-mono`, `zod`, `vitest`. Build the calendar time grid yourself with pointer events (snap to 15 minutes); do not add a heavy calendar library.

## 4. Voice pipeline and instant replies

States: `IDLE -> RECORDING -> UPLOADING -> QUEUED -> TRANSCRIBING -> THINKING -> DONE -> SPEAKING -> IDLE`. Mic is push-to-talk (hold or tap). No wake word.

Latency budget (estimates, to be measured in Phase 0): upload 0.3-1 s (phone only), STT 0.5-2 s, LLM 2-4 s on CPU (faster on GPU), scheduler < 0.1 s.

How to feel instant:
1. **Local ack on release:** the device plays a short cached "On it" sound the moment the mic is released, before upload.
2. **Fast path (no LLM):** `apps/brain/src/fastpath.ts` regex handlers for: what's next / what's my day, cancel <title>, move <title> to <time>, shift/push everything by N minutes ("I'm running 20 minutes late"), undo, pause memory, forget last hour. Target < 1 s after STT.
3. **Keep models warm:** Ollama `keep_alive: "30m"`; Whisper loaded at sidecar start. Keep the system prompt + schema identical and first in the prompt so Ollama reuses the cached prefix; put today's schedule next, utterance last.
4. **Short structured output** (about 60 tokens), `n_predict` capped, templated reply built from the scheduler diff (never LLM-written).
5. **Status transitions** written to the `commands` row so the UI shows progress ("Heard: ...").
6. **Stretch:** streaming transcription so STT finishes mostly during speech (WhisperLiveKit / whisper_streaming style).

## 5. LLM contract

Prompt = static system prompt + compact schedule (`id|title|start-end|fixed/flex|priority`) + now (date, weekday, timezone) + utterance. LLM outputs ONE object matching `intentSchema.ts` (enforced by Ollama `format`):

```json
{
  "intent": "add_event|move_event|cancel_event|query_day|replan|shift_day|add_task|add_assignment|complete_task|undo|memory_search|forget|pause_memory|chitchat",
  "title": "Meet friend",
  "target": "gym",                       // title/fuzzy ref of existing item for move/cancel
  "targetDay": "monday",                 // which occurrence of target ("cancel gym tomorrow"), same formats as day
  "day": "today|tomorrow|monday..sunday|YYYY-MM-DD",
  "start": "19:00", "end": null, "durationMin": 90,
  "fixed": true, "priority": "high", "travelMin": 20,
  "shiftMin": null,
  "anchor": { "relation": "after", "target": "dinner" },  // or null: place relative to another item
  "scope": "one",                        // one | all: "all" only when the user says every/all
  "memory": { "text": "papers about EEG", "day": "wednesday", "range": null },  // range: last_hour|today|yesterday|this_week|null
  "rearrangeOthers": true,
  "clarify": null                         // question string if ambiguous
}
```

Rules: times as `HH:mm`, days as words/ISO; code converts to minutes since midnight + dates. If anything is ambiguous, set `clarify` and speak the question. Validate every output with the schema (zod) before use; on invalid output retry once, then ask the user to repeat.

**Scheduler** (`packages/core/src/scheduler`, pure TS, 100% unit-tested with Vitest, no I/O):

`applyIntent(state, intent, now) -> { state, diff, reply }`
- Input state = expanded occurrences for a horizon (default today + 7 days) via `expandEvents`, plus settings (wake, sleep, working hours, default buffer).
- `fixed` events (classes, commitments, user-declared fixed) never move.
- Insert the new item; find overlaps including `travelMin` buffers; for each displaced **flexible** item, place it in the nearest free slot the same day within waking hours, preferring same part of day, higher priority placed first, keeping duration.
- If nothing fits: mark `unscheduled`, set `clarify` ("Gym doesn't fit today, move it to tomorrow?").
- `diff` = moved / added / removed / unscheduled. `reply` templated from diff ("Done. Gym moves to 7:30, you're free for your friend at 7.").
- Undo stack: store inverse of the last N applied diffs in `commands.diff` (reversible); `undo` replays the inverse.
- Recurring occurrences: moving one occurrence writes a `move` row in `event_exceptions`; cancelling one writes a `skip` row; never edit a series from a voice command unless the user says "every" / "all".

Test cases (minimum): add fixed over two flexible; no free slot; travel buffer; cancel; undo; shift_day; recurring override; class blocks stay put; priority ordering; midnight edge; DST day.

## 6. Supabase additions (`0002_devices_commands.sql`; section 3 tables are `0001_core_schema.sql`)

```sql
create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('laptop','phone')),
  name text, last_seen timestamptz default now(),
  pair_code text, pair_expires_at timestamptz,
  created_at timestamptz default now()
);
create table commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('phone','laptop')),
  kind text not null check (kind in ('audio','text')),
  audio_path text, text text,
  status text not null default 'queued'
    check (status in ('queued','transcribing','thinking','done','error')),
  transcript text, reply_text text, diff jsonb, error text,
  stt_ms int, llm_ms int, total_ms int,   -- latency for the debug panel
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- profiles, classes, assignments, tasks, events, event_exceptions: see section 3
```
- RLS on both tables: `user_id = auth.uid()`. Storage bucket `voice-clips` private, path `user_id/command_id.webm`, policy by folder = uid. Delete the clip after transcription.
- Enable Realtime on `commands`, `events`, `event_exceptions` (so skipping one occurrence reaches the phone), `tasks`, `devices`. DELETE payloads carry only the primary key under RLS: refetch on delete.
- `devices` has `unique (user_id, role)`: one laptop and one phone per account (apps/web upserts on it).
- Use `pg_cron` or the brain to delete clips/rows older than 24 h.

**Pairing (QR):** laptop `/pair` creates a `devices` row (role laptop) with a random 6-character `pair_code` and a 5-minute expiry, and shows a QR of `https://<site>/remote?pair=<code>` (BrowserRouter, no hash).
- **Code format:** 6 characters from the Crockford-style alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` (no 0, O, 1, I, L, U). Stored normalized (uppercase, no dash) in `devices.pair_code`; displayed as `XXX-XXX`; the phone accepts it with or without the dash and in any case.
- **Claim:** the phone, signed in with the same Google account, scans the QR or types the code and calls RPC `claim_pair(code)` (`SECURITY DEFINER`). The RPC is **scoped to `auth.uid()`**: it only matches a laptop row owned by the caller, enforces the expiry, clears `pair_code` after one successful claim, and registers the phone as a `devices` row (role phone). Signature `claim_pair(code text, phone_name text default null) returns jsonb {laptop_name, laptop_device_id, phone_device_id}`. Failures raise errors whose message contains `expired` or `account` (code not active for this account, or not signed in). No rate limit: the caller can already read their own `pair_code` through RLS, and a raised error would roll back any attempt counter.
- **Wrong account:** because the RPC is scoped to the caller, a phone signed in to a different account just gets "not found". Show the designed wrong-account state with generic wording ("This code isn't for this account, or it expired"). Never reveal whether a code exists for another user.
- **States to implement (all 11 designed):** phone: intro, camera primer, camera denied, scanner, enter code, confirming, connected, expired, wrong account, laptop offline, already paired. Laptop: waiting, confirming, connected, expired, offline. Laptop is "offline" when `devices.last_seen` is older than 45 s.
- **Scanning:** use `BarcodeDetector` where available; otherwise fall back to a small JS QR decoder (for example `jsqr`) on camera frames; the typed code is always available. Camera and mic need HTTPS (localhost counts, a LAN IP does not).

**Brain auth:** `npm run brain:login` opens a browser for Google sign-in and stores the Supabase refresh token in `apps/brain/.session` (gitignored). The brain never uses the service-role key. Heartbeat: update `devices.last_seen` every 15 s.

## 7. Memory (laptop only)

- **Capture:** Chrome MV3 extension. Content script extracts readable text (Mozilla Readability on `document`), debounced: record a page after 5 s of dwell and again on significant scroll/DOM change. Sends `{url, title, text, timestamp}` to `http://127.0.0.1:<brainPort>/memory/ingest` (brain restricts to extension origin + local token).
- **Do not screenshot every 5-10 s.** Too heavy for a local vision model. Use text capture. Screenshots only as a stretch for PDFs/canvas pages (render with pdf.js text layer first).
- **Store:** SQLite (better-sqlite3), tables `pages` + FTS5 index + embeddings column from a small local embedding model via Ollama (verify the model name, e.g. `nomic-embed-text`, with `ollama list`/the library before relying on it).
- **Query:** `memory_search` intent -> code resolves `day`/`range` to timestamps -> hybrid search (FTS5 + embedding similarity) limited to that range -> top results passed to Qwen to write a 2-sentence spoken answer plus a list of links on screen.
- **Privacy controls:** pause toggle (voice + UI), default exclude list (banking, email, health portals, incognito windows), per-site exclude, "forget last hour / forget today", retention setting, everything stored under a local folder, nothing uploaded.
- **Planner link:** `memory_search` results can seed tasks ("add a task to finish reading that paper").

## 8. Work split for two coding agents

Both agents read AGENTS.md first. File ownership prevents merge conflicts.

**Agent A (Claude Code): core logic**
Owns `packages/core/**`, `apps/brain/**`, `supabase/migrations/**`.
Order: A1 monorepo scaffold (npm workspaces, TypeScript strict, Vitest) -> A2 migrations for section 3 + 6 and generated types (freeze the contract, tell Agent B) -> A3 `expandEvents` + intentSchema + scheduler + Vitest -> A4 Ollama client + fast path + prompt -> A5 relay (Realtime subscribe, status updates, heartbeat) -> A6 STT sidecar integration -> A7 memory store + ingest + search.

**Agent B (OpenCode): product surface**
Owns `apps/web/**` (except core imports) and `apps/extension/**`.
Order: B1 scaffold `apps/web` (Vite + React + TS + Tailwind v4, `tokens.css`, fonts, icons, app shell) -> B2 auth screens + **pairing** (laptop `/pair`, phone `/remote` pair flow, real QR) -> B3 `/remote` phone calendar (read-only day/week, talk button, offline banner, local ack sound, speechSynthesis) -> B4 laptop voice bar + live status + Dashboard + Calendar (drag/resize, fixed vs flexible) -> B5 classes, assignments, tasks, wizard, Settings -> B6 Memory page -> B7 Chrome extension -> B8 polish + demo mode + month view.

Shared contract files (changes need both agents): `packages/core/src/types.ts`, `intentSchema.ts`, the Supabase migrations, and the `commands` row shape. Commit small, merge to `main` often.

## 9. Timeline

**Phase 0: spikes (safe before the event, ~2 h)**
1. Qwen3.5 4B vs 2B on the laptop: JSON validity + tokens/s on the test prompts in section 10.
2. Relay: text command from phone -> Supabase -> laptop writes an event -> phone updates.
3. STT: record a clip on the phone, transcribe on the laptop, time it.
4. (Optional) Gemma 4 E4B audio via Ollama.
Exit: pick the model, record the measured latencies in `docs/measurements.md`.

**Phase 1 (only if B1 allows pre-event code):** A1-A3, B1-B2.
**Hackathon day 1:** A4-A6, B3-B5. Voice round-trip working end to end by the end of day 1.
**Hackathon day 2:** A7, B6-B7 (Memory), polish, demo script, 2 clean rehearsals, recorded backup video, code freeze 1 hour before judging.

Cut order if late: Memory PDFs -> embeddings (keep FTS only) -> streaming STT -> weekly digest.

## 10. Acceptance tests (the demo script)

1. "Hey Rocky, I'm meeting a friend at 7 tonight for an hour and a half." -> event added, flexible items rearranged, classes untouched, spoken summary.
2. "Move my study block after dinner." (move one flexible item)
3. "I'm running 20 minutes late." (shift_day)
4. "What's my day look like?" (query, fast path, < 2 s after speech)
5. "Cancel gym tomorrow." (recurring: skip one date only)
6. "Undo that."
7. Phone far from the laptop (different network): command from phone changes both calendars.
8. "What was I reading on Wednesday?" (Memory answer + links)
9. "Pause memory." / "Forget the last hour."
10. Laptop asleep: phone shows offline; wake it, queued command runs.

Also measure and show on screen: STT ms, LLM ms, total ms.

## 11. Extra features (ranked, only after core works)

1. Memory-aware planning ("you read about X for 2 hours, want to block time to finish it?").
2. Plan vs actual: end-of-day check ("you planned 3 h of study, did you do it?") that adjusts tomorrow.
3. Syllabus/deadline ingestion: drop a PDF or paste text -> assignments + exam dates appear.
4. Weekly study digest + 5-question quiz from what you actually read.
5. Morning briefing spoken on the phone.
6. Hindi / Hinglish voice commands (Whisper multilingual + Qwen).

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Qwen too slow on laptop CPU | use 2B, shorten prompt, fast path for common commands |
| Gemma/Qwen emits invalid JSON | schema-enforced `format`, zod validate, retry once |
| Supabase free project pauses after inactivity | open the project daily before the event; check dashboard on demo day |
| Venue Wi-Fi blocks Supabase or WebSockets | phone hotspot as backup; record backup video |
| Phone mic needs HTTPS | hosted site on Render (static), not a LAN IP |
| Building the calendar UI from scratch is the biggest UI cost | build day/week first, month view last; follow the P0/P1/P2 tiers in section 3 |
| Chrome extension cannot reach brain | local token + CORS for the extension origin; fall back to manual "save this page" button |
| Pre-built code not allowed | do only Phase 0 spikes and design until the event starts |

## 13. Unverified assumptions (check, don't trust)

- Qwen3.5 benchmark numbers are from the vendor model card.
- Ollama's `think: false` flag and `format` JSON schema behave as expected for `qwen3.5` tags on the installed Ollama version.
- Embedding model name and availability in the installed Ollama.
- Supabase Realtime and Storage limits on the free plan are far above this app's traffic (not verified here).

## 14. Design handoff (Claude Design, v0.1)

Files in `design/` (move the loose `tokens.css`, `Rocky_*.dc.html` and `support.js` into it; reference only, never shipped): `Rocky_Design_System.dc.html`, `Rocky_Prototype.dc.html` (desktop 1440x900), `Rocky_Mobile.dc.html` (390x844), `support.js` (runtime needed to preview them), and `tokens.css` (the extracted tokens, copy to `apps/web/src/styles/tokens.css`). To preview a `.dc.html`, open it in a browser from a local static server so `support.js` loads. The `.dc.html` files use Claude Design's own runtime and simulated data: treat them as a **visual and behavior spec**, and re-implement in React + Tailwind. Do not copy their runtime.

**Locked design tokens** (full list in `tokens.css`): dark theme is primary, light second, both via `data-theme="dark|light"` on a wrapper. Accent `#4F5BD5` (scale 50-900: `#EEF0FC #DCE0F9 #BCC2F3 #959EEB #7079E0 #4F5BD5 #3E48B8 #333B94 #2A3075 #1F2457`). Calendar colors per kind: `cls` fixed class, `com` fixed commitment, `stu` flexible study, `per` flexible personal, `brk` break, `ddl` deadline, each with `-bg / -edge / -fg`. Fonts: Plus Jakarta Sans (UI, tabular numerals for times) + JetBrains Mono (codes, commands, latency HUD); self-host via `@fontsource` so the app works offline. Icons: Lucide (`lucide-react`, already in Clarity). Radii 8 / 12 / 16 / pill. Logomark: rounded square with three white bars on the accent color, min 20 px.

**Block language (must match):** fixed = solid 1 px edge + lock icon, not draggable; flexible = 2 px dashed top edge + grip icon, drag/resize snapping to 15 min; priority = colored dot + text label (High/Med/Low); travel buffer = faint diagonal stripes before the event; ghost outline = dashed outline "was 7:00" for 2 s after a voice change; changed blocks get a 2 px accent ring for 6 s. Latency HUD: STT / AI / Total ms, total turns amber over 3 s and red over 6 s. Motion: block glide 700 ms `cubic-bezier(.2,.8,.2,1)`; honor `prefers-reduced-motion`.

**What the designs cover**
- Desktop prototype: sign in, 5-step setup wizard (Profile, About you, Classes, Brain checklist, Phone pairing with two layouts `1a` / `1b`, all pairing states), Dashboard, Calendar with the voice-command replan, ghost/highlight/Undo, voice overlay states, Activity history data, devices list, status chips, toasts, confirm dialog.
- Mobile prototype: sign in (Google primary, email expands inline), pairing (intro, camera primer, camera denied, scanner, enter code, connecting, connected, expired, wrong account, laptop offline, already paired), calendar (day, week, empty day), voice (run command, clarify, didn't catch, mic primer, mic blocked), laptop online / reconnecting / offline, system states (skeleton, no network, update, install hint, event banner, session expired).

**Not designed yet (needs a second design round before building):** Classes page and class/assignment dialogs, Tasks page, Memory page (ask box, answer with sources, timeline, privacy panel), Chrome extension popup, Activity page (only its data rows exist), Settings (profile, About you, Voice, AI, Devices, Privacy), Event dialog with the Fixed toggle and recurrence scope dialog, Month view, forgot/reset password, email confirmation. Until they exist, build these with the same tokens and component patterns, then replace when the designs land.

**Corrections to apply when building from the designs**
1. The sample device is "Om's iPhone 15". The real phone is **Android**, so use a generic device name taken from the OS (for example from `navigator.userAgentData` or a name the user types) and Android-appropriate install/haptics behavior (`navigator.vibrate` works on Android Chrome, not iOS).
2. The QR code in the prototype is a **fake pattern**. Generate a real QR with a library (for example `qrcode` or `qrcode.react`) encoding `https://<site>/remote?pair=<code>`.
3. Pairing codes in the prototype (`K7P-2QM` style) are hard-coded. Generate real 6-character codes server-side with a 5-minute expiry as in section 6.
4. The wizard's "Study style" chips include "Pomodoro". There is no Pomodoro feature; drop that chip or keep it only as a plain preference tag.
5. The wizard's step 4 checklist shows the command `rocky-brain start`. Make the real command match the final brain CLI name.
6. Samples use real-looking personal data (name, email, school). Replace with seed data from the demo user, and never hard-code personal data into shipped code.
7. Google Fonts and the Lucide CDN are used in the design files. In the app, bundle fonts and icons locally.
8. Sidebar items shown: Dashboard, Calendar, Classes, Memory, Activity, Settings (Tasks lives on the Dashboard and the Day view). Confirm with Om before adding a separate Tasks page.

**Implementation order for the UI (OpenCode, matches section 8):** B1 scaffold the app, add `tokens.css` + font/icon packages and map tokens into Tailwind v4 with `@theme inline` (for example `--color-surface: var(--surface)`) without renaming any token, so utilities like `bg-surface` work -> build the app shell (sidebar, top bar, voice bar, status chips) -> build **Pairing first** (laptop `/pair` page and wizard step 5, phone `/remote` pair flow with real QR scan using the camera API or `BarcodeDetector`, with the typed-code fallback) -> phone calendar + talk button + result sheet -> laptop Dashboard + Calendar with voice states -> remaining pages.