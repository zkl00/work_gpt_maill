import type { AppEnv } from "./lib/cloudflare";

// .open-next/worker.js is created by `opennextjs-cloudflare build`.
// @ts-expect-error Generated file is intentionally absent before the first Cloudflare build.
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      import("./lib/reminder-job")
        .then(({ runReminderJob }) => runReminderJob(env as AppEnv))
        .then((result) => console.info("Expiration reminder job completed.", result))
        .catch((error) => console.error("Expiration reminder job failed.", error)),
    );
  },
} satisfies ExportedHandler<AppEnv>;
