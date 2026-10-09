import { defineConfig } from "vitest/config";

// Run tests in a DST-observing zone so any accidental local-time Date math fails loudly.
process.env.TZ = "America/New_York";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/brain/src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
