import cron from "node-cron";
import { runRssFetch } from "./rssParser";
import { sendDigestToAll } from "./telegramBot";
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

  // Daily digest at 9:00 Moscow time (UTC+3 = 06:00 UTC)
  cron.schedule("0 6 * * *", async () => {
    logger.info("Sending daily Telegram digest (9:00 MSK)");
    try {
      await sendDigestToAll();
    } catch (err) {
      logger.error({ err }, "Daily digest send failed");
    }
  });

  logger.info("Daily Telegram digest scheduled at 09:00 MSK (06:00 UTC)");
}
