# Rocky: agent rules (read PLAN.md first)

Rocky is a voice-first student planner + private "memory". Laptop runs the AI locally; phone is a voice remote that shows only the calendar; Supabase is the login + relay + calendar store. Built from scratch (Clarity, an earlier app by the same author, is only a feature checklist; copy nothing from it).

## Hard rules
- **No cloud AI APIs.** All AI is local: Ollama (`ROCKY_LLM`, default `qwen3.5:2b`, `think:false`, temperature 0.1) and faster-whisper. No OpenAI/Gemini/ElevenLabs calls.
- **The LLM only returns intent JSON** enforced by the JSON schema in `packages/core/src/intentSchema.ts` (Ollama `format`). It never does date math, conflict resolution or rescheduling. `packages/core/src/scheduler` does, as pure TypeScript with Vitest tests.
- **Fixed events never move.** Classes and fixed commitments (`fixed = true`) are immovable. Only flexible events get rearranged.
- **Recurring series:** a voice command edits one occurrence (a `move` or `skip` row in `event_exceptions`) unless the user says "every" or "all".
- **Memory data stays on the laptop.** Never upload page text, screenshots or memory search results to Supabase.
- **No Pomodoro or focus-timer feature.** Do not build one.
- **Times are minutes since midnight** (`start_min`, `end_min`) plus a `date`; weekdays 0 = Sunday. Recurring events are one row plus `event_exceptions`.
- **Do not add or change the Supabase schema or the `commands` row shape without telling the other agent.** Contract files: `packages/core/src/types.ts`, `intentSchema.ts`, `supabase/migrations/**`.
- Never commit secrets or `apps/brain/.session`. The brain uses the user's session, never the Supabase service-role key.
- The data model in PLAN.md section 3 is the contract. If you need to change it, tell Om and the other agent first.
- If unsure about a requirement, stop and ask. Do not invent features outside PLAN.md.

## UI rules
- Follow `design/` (Claude Design v0.1) for look and behavior: tokens in `design/tokens.css`, fixed = lock icon + solid edge, flexible = dashed edge + grip, dark theme primary. The `.dc.html` files are a visual spec only. Re-implement in React + Tailwind; never import their runtime.
- Real QR codes, real pairing codes, no hard-coded personal data, fonts and icons bundled locally. Build pairing (laptop `/pair`, phone `/remote` pair flow) first.

## Layout
`packages/core` (types, schema, scheduler, recurrence, data API) | `apps/web` (Vite + React + TS + Tailwind v4: laptop app + `/remote` phone view) | `apps/brain` (laptop Node process: relay, STT, LLM, fast path, memory) | `apps/extension` (Chrome MV3 capture) | `supabase/migrations`.

## Ownership (no merge conflicts: one builder, one auditor)
- OpenCode (builds everything): `packages/core/**`, `apps/brain/**`, `supabase/migrations/**`, `apps/web/**`, `apps/extension/**`, docs. One branch per phase, never commit to `main`.
- Claude Code (audits): reviews and tests each phase after it is pushed. It does not write product code; contract changes are proposed by OpenCode in the phase report and applied only after Om approves.

## Commands
- install: `npm install` | typecheck: `npx tsc --noEmit` | test: `npx vitest run` (and `npm test` in apps/web)
- web dev: `npm run dev -w apps/web` | brain: `npm run dev -w apps/brain` | brain login: `npm run brain:login -w apps/brain`

## Definition of done
Typecheck + tests pass; works with the laptop offline from the internet except the Supabase relay; latency (stt_ms, llm_ms, total_ms) logged and visible in a debug panel; the demo script in PLAN.md section 10 passes.
