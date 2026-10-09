// Applies supabase/migrations to an in-process Postgres (PGlite) with minimal stand-ins for
// Supabase's auth/storage schemas, then checks RLS, the class -> event trigger and claim_pair.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
`;

// Supabase grants these by default; RLS does the real filtering.
const SUPABASE_GRANTS = `
  grant usage on schema public, storage to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on storage.objects to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
`;

let db: PGlite;

/** Runs `fn` as a signed-in user (RLS enforced), rolling back nothing: each call is its own transaction. */
async function as<T>(user: string, fn: (q: (sql: string, params?: unknown[]) => Promise<T[]>) => Promise<unknown>) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    await tx.query("set local role authenticated");
    return fn(async (sql, params) => (await tx.query<T>(sql, params)).rows);
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(SUPABASE_GRANTS);
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"full_name":"Test A"}'), ($2, '{}')`, [ALICE, BOB]);
});

describe("migrations", () => {
  it("create a profile for each new user", async () => {
    const rows = (await db.query<{ user_id: string; full_name: string | null; wake_min: number }>("select user_id, full_name, wake_min from public.profiles order by user_id")).rows;
    expect(rows).toEqual([
      { user_id: ALICE, full_name: "Test A", wake_min: 420 },
      { user_id: BOB, full_name: null, wake_min: 420 },
    ]);
  });

  it("isolate users with RLS and default user_id to auth.uid()", async () => {
    await as(ALICE, (q) => q(`insert into public.events (title, event_date, start_min, end_min) values ('Gym', '2026-10-12', 1140, 1200)`));
    const mine = (await as(ALICE, (q) => q("select title from public.events"))) as { title: string }[];
    const theirs = (await as(BOB, (q) => q("select title from public.events"))) as unknown[];
    expect(mine.map((r) => r.title)).toContain("Gym");
    expect(theirs).toEqual([]);
    await expect(as(BOB, (q) => q(`insert into public.events (user_id, title, event_date, start_min, end_min) values ($1, 'Sneaky', '2026-10-12', 60, 120)`, [ALICE]))).rejects.toThrow(/row-level security/);
  });

  it("enforce time ranges, including an event ending at midnight", async () => {
    await as(ALICE, (q) => q(`insert into public.events (title, event_date, start_min, end_min) values ('Late', '2026-10-12', 1380, 1440)`));
    await expect(as(ALICE, (q) => q(`insert into public.events (title, event_date, start_min, end_min) values ('Bad', '2026-10-12', 1380, 1441)`))).rejects.toThrow();
    await expect(as(ALICE, (q) => q(`insert into public.events (title, event_date, start_min, end_min) values ('Bad', '2026-10-12', 600, 600)`))).rejects.toThrow();
  });

  it("allow one exception per occurrence", async () => {
    const [e] = (await as(ALICE, (q) =>
      q(`insert into public.events (title, event_date, start_min, end_min, repeat_freq, repeat_days) values ('Run', '2026-10-05', 420, 480, 'weekly', '{1,3}') returning id`),
    )) as { id: string }[];
    await as(ALICE, (q) => q(`insert into public.event_exceptions (event_id, occurrence_date, kind) values ($1, '2026-10-12', 'skip')`, [e!.id]));
    await expect(as(ALICE, (q) => q(`insert into public.event_exceptions (event_id, occurrence_date, kind) values ($1, '2026-10-12', 'skip')`, [e!.id]))).rejects.toThrow(/duplicate/);
    await expect(as(ALICE, (q) => q(`insert into public.event_exceptions (event_id, occurrence_date, kind) values ($1, '2026-10-14', 'move')`, [e!.id]))).rejects.toThrow();
  });

  it("keep a fixed weekly event in sync with each class", async () => {
    const [c] = (await as(ALICE, (q) =>
      q(`insert into public.classes (name, code, starts_on, ends_on, start_min, end_min, meeting_days) values ('Calculus', 'MATH 101', '2026-09-07', '2026-12-11', 540, 615, '{1,3}') returning id`),
    )) as { id: string }[];
    type Ev = { title: string; kind: string; fixed: boolean; repeat_freq: string; repeat_days: number[]; start_min: number; repeat_until: string | Date };
    const load = async () => (await as(ALICE, (q) => q(`select title, kind, fixed, repeat_freq, repeat_days, start_min, repeat_until from public.events where class_id = $1`, [c!.id]))) as Ev[];

    expect(await load()).toMatchObject([{ title: "Calculus", kind: "class", fixed: true, repeat_freq: "weekly", repeat_days: [1, 3], start_min: 540 }]);

    await as(ALICE, (q) => q(`update public.classes set name = 'Calc I', start_min = 600, end_min = 675, meeting_days = '{2,4}' where id = $1`, [c!.id]));
    expect(await load()).toMatchObject([{ title: "Calc I", repeat_days: [2, 4], start_min: 600 }]);

    await as(ALICE, (q) => q(`insert into public.assignments (class_id, title) values ($1, 'PS 1')`, [c!.id]));
    await as(ALICE, (q) => q(`delete from public.classes where id = $1`, [c!.id]));
    expect(await load()).toEqual([]);
    expect(await as(ALICE, (q) => q(`select 1 from public.assignments where class_id = $1`, [c!.id]))).toEqual([]);
  });

  it("drop the class event when the schedule is cleared", async () => {
    const [c] = (await as(ALICE, (q) => q(`insert into public.classes (name, start_min, end_min, meeting_days) values ('Seminar', 600, 660, '{5}') returning id`))) as { id: string }[];
    await as(ALICE, (q) => q(`update public.classes set meeting_days = '{}' where id = $1`, [c!.id]));
    expect(await as(ALICE, (q) => q(`select 1 from public.events where class_id = $1`, [c!.id]))).toEqual([]);
  });

  it("bump commands.updated_at and require text or audio", async () => {
    const [cmd] = (await as(ALICE, (q) => q(`insert into public.commands (source, kind, text) values ('phone', 'text', 'what is next') returning id, updated_at`))) as { id: string; updated_at: Date }[];
    const [after] = (await as(ALICE, (q) => q(`update public.commands set status = 'done', stt_ms = 0, llm_ms = 900, total_ms = 1100 where id = $1 returning updated_at`, [cmd!.id]))) as { updated_at: Date }[];
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(cmd!.updated_at).getTime());
    await expect(as(ALICE, (q) => q(`insert into public.commands (source, kind) values ('phone', 'audio')`))).rejects.toThrow();
  });

  it("publish the realtime tables", async () => {
    const rows = (await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).rows;
    expect(rows.map((r) => r.tablename)).toEqual(["commands", "devices", "event_exceptions", "events", "tasks"]);
  });
});

describe("claim_pair", () => {
  const publish = (user: string, code: string, minutes = 5) =>
    as(user, (q) =>
      q(
        `insert into public.devices (role, name, pair_code, pair_expires_at) values ('laptop', 'My laptop', $1, now() + make_interval(mins => $2))
         on conflict (user_id, role) do update set pair_code = excluded.pair_code, pair_expires_at = excluded.pair_expires_at`,
        [code, minutes],
      ),
    );
  const claim = (user: string, code: string) => as(user, (q) => q(`select public.claim_pair($1, 'My Android phone') as r`, [code]));

  it("pairs the phone with the same account's laptop, once", async () => {
    await publish(ALICE, "K7PQ2M");
    const [row] = (await claim(ALICE, "k7p-q2m")) as { r: { laptop_name: string; phone_device_id: string } }[];
    expect(row!.r.laptop_name).toBe("My laptop");
    const devices = (await as(ALICE, (q) => q(`select role, name, pair_code from public.devices order by role`))) as unknown[];
    expect(devices).toEqual([
      { role: "laptop", name: "My laptop", pair_code: null },
      { role: "phone", name: "My Android phone", pair_code: null },
    ]);
    await expect(claim(ALICE, "K7PQ2M")).rejects.toThrow(/account/);
  });

  it("never matches another account's laptop", async () => {
    await publish(BOB, "ABCDEF");
    await expect(claim(ALICE, "ABCDEF")).rejects.toThrow(/not active for this account/);
  });

  it("rejects expired codes", async () => {
    await publish(BOB, "HJKMNP", -1);
    await expect(claim(BOB, "HJKMNP")).rejects.toThrow(/expired/);
  });

  it("rejects codes outside the alphabet", async () => {
    await expect(publish(ALICE, "ABC0EF")).rejects.toThrow(/check constraint/);
  });

  it("is not callable without a session", async () => {
    await expect(db.query(`select public.claim_pair('ABCDEF')`)).rejects.toThrow(/Sign in first/);
  });
});
