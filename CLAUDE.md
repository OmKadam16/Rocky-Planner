@AGENTS.md

# Claude Code specifics
- You are Agent A. Follow the A1-A7 order in PLAN.md section 8. Do not edit `apps/web/**` or `apps/extension/**`.
- Write the scheduler and its Vitest tests before wiring anything to Ollama or Supabase.
- When you change a shared contract (types, intentSchema, migrations, `commands` shape), say so in your commit message and update PLAN.md.
