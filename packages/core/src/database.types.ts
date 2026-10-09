// SHARED CONTRACT. supabase-js `Database` type for createClient<Database>(...).
// Hand-written from supabase/migrations until the Supabase project exists; then replace with
// `supabase gen types typescript` output (the row shapes must stay identical to types.ts).
import type { ClassRow, Assignment, Command, Device, EventException, EventRow, Profile, Task } from "./types";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Columns with database defaults are optional on insert. */
type Insert<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> & Partial<Pick<Row, Defaulted>>;

type Table<Row, Defaulted extends keyof Row> = {
  Row: Row;
  Insert: Insert<Row, Defaulted>;
  Update: Partial<Row>;
  Relationships: [];
};

type Nullables<Row> = { [K in keyof Row]: null extends Row[K] ? K : never }[keyof Row];

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, keyof Profile>; // every column has a default (user_id = auth.uid())
      classes: Table<ClassRow, "id" | "user_id" | "created_at" | "meeting_days" | Nullables<ClassRow>>;
      assignments: Table<Assignment, "id" | "user_id" | "created_at" | "status" | Nullables<Assignment>>;
      tasks: Table<Task, "id" | "user_id" | "created_at" | "done" | "position" | Nullables<Task>>;
      events: Table<EventRow, "id" | "user_id" | "created_at" | "kind" | "fixed" | "priority" | "travel_min" | "repeat_freq" | Nullables<EventRow>>;
      event_exceptions: Table<EventException, "id" | "user_id" | "created_at" | Nullables<EventException>>;
      devices: Table<Device, "id" | "user_id" | "created_at" | "last_seen" | Nullables<Device>>;
      commands: Table<Omit<Command, "diff"> & { diff: Json | null }, "id" | "user_id" | "created_at" | "updated_at" | "status" | Nullables<Command>>;
    };
    Views: Record<never, never>;
    Functions: {
      claim_pair: {
        Args: { code: string; phone_name?: string };
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
