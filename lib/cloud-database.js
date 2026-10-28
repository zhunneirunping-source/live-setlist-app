// Shared with the Planner: Access protects the full production route space.
/** @returns {Promise<D1Database>} */
export async function database() {
  const runtime = await import("cloudflare:workers");
  if (!runtime.env?.DB) throw new Error("Database binding is unavailable");
  return runtime.env.DB;
}

/** @param {Request} request */
export function authorize(request) {
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local-development";
  return request.headers.get("cf-access-authenticated-user-email")?.trim() || null;
}
