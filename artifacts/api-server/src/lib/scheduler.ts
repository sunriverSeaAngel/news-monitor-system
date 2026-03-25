import cron from "node-cron";
import { runRssFetch } from "./rssParser";
import { logger } from "./logger";

export function startScheduler(): void {
  logger.info("Starting RSS scheduler (every 2 hours)");

  runRssFetch().catch((err) => {
    logger.error({ err }, "Initial RSS fetch failed");
  });

  cron.schedule("0 */2 * * *", async () => {
    logger.info("Scheduled RSS fetch triggered");
    try {
      await runRssFetch();
    } catch (err) {
      logger.error({ err }, "Scheduled RSS fetch failed");
    }
  });
}
