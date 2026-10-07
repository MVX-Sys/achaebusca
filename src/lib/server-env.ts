// Bridges runtime environment values into `process.env` so server code
// (Supabase clients / auth middleware) works on any host, including
// Cloudflare Workers where bindings arrive via the `env` argument and
// only the build-time VITE_* values are inlined.

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_ID",
] as const;

function setIfMissing(key: string, value: unknown) {
  if (typeof value !== "string" || value.length === 0) return;
  const env = (globalThis as any).process?.env;
  if (!env) return;
  if (!env[key]) env[key] = value;
}

let bridged = false;

export function bridgeServerEnv(runtimeEnv?: unknown) {
  if (!(globalThis as any).process) {
    (globalThis as any).process = { env: {} } as any;
  } else if (!(globalThis as any).process.env) {
    (globalThis as any).process.env = {};
  }

  // Cloudflare-style bindings (vars + secrets) passed to fetch()
  if (runtimeEnv && typeof runtimeEnv === "object") {
    for (const key of KEYS) {
      setIfMissing(key, (runtimeEnv as Record<string, unknown>)[key]);
    }
    // Every other string binding (e.g. third-party API keys such as GESTAOCLICK_*).
    for (const [key, value] of Object.entries(runtimeEnv as Record<string, unknown>)) {
      setIfMissing(key, value);
    }
    // Allow VITE_-prefixed bindings too
    setIfMissing("SUPABASE_URL", (runtimeEnv as any).VITE_SUPABASE_URL);
    setIfMissing(
      "SUPABASE_PUBLISHABLE_KEY",
      (runtimeEnv as any).VITE_SUPABASE_PUBLISHABLE_KEY,
    );
  }

  if (bridged) return;
  bridged = true;

  // Build-time inlined public values as a last-resort fallback.
  setIfMissing("SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
  setIfMissing(
    "SUPABASE_PUBLISHABLE_KEY",
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  setIfMissing("SUPABASE_PROJECT_ID", import.meta.env.VITE_SUPABASE_PROJECT_ID);
}
