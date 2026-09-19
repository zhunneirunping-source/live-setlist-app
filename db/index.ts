import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  try {
    const runtimeModule = await import("cloudflare:workers");
    const { env } = runtimeModule as { env?: { DB?: D1Database } };

    if (!env?.DB) {
      throw new Error(
        "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.",
      );
    }

    return drizzle(env.DB, { schema });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Cloudflare runtime error";
    throw new Error(
      `D1 is unavailable in this runtime: ${message}. This only works when the app is running inside a Cloudflare Worker/Miniflare environment.`,
    );
  }
}
