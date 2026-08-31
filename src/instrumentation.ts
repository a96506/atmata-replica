export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureJobsRuntime } = await import("./lib/jobs/boot");
    ensureJobsRuntime();
  }
}
