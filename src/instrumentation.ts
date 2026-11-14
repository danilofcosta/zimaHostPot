/**
 * Runs once when the Next.js server starts. Creating the initial admin here
 * (instead of during a render) keeps the first request fast and guarantees the
 * account exists before the login route is used.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureInitialAdmin } = await import("./lib/server/bootstrap");
    try {
      await ensureInitialAdmin();
    } catch (error) {
      console.error("[bootstrap] Could not create the initial admin:", error);
    }
  }
}
