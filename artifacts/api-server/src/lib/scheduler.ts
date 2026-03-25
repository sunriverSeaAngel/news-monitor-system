import cron from "node-cron";
import { runRssFetch } from "./rssParser";
import { sendDigestToAll } from "./telegramBot";
import { generateEmbedding, saveEmbedding } from "./rag";
import { pool } from "@workspace/db";
import { logger } from "./logger";

async function backfillEmbeddings(): Promise<void> {
  const result = await pool.query<{ id: number; title: string; summary: string | null; raw_text: string | null }>(
    "SELECT id, title, summary, raw_text FROM news WHERE embedding IS NULL LIMIT 200",
  );
  const rows = result.rows;
  if (rows.length === 0) return;

  logger.info({ count: rows.length }, "Backfilling embeddings for existing articles");

  for (const row of rows) {
    const text = `${row.title}. ${row.summary ?? (row.raw_text ?? "").slice(0, 500)}`;
    const embedding = await generateEmbedding(text);
    if (embedding) {
      await saveEmbedding(row.id, embedding).catch((err) => {
        logger.error({ err, newsId: row.id }, "Backfill embedding save failed");
      });
    }
  }

  logger.info({ count: rows.length }, "Embedding backfill complete");
}

export function startScheduler(): void {
  logger.info("Starting RSS scheduler (every 2 hours)");

  // Backfill embeddings for existing articles on startup
  backfillEmbeddings().catch((err) => {
    logger.error({ err }, "Embedding backfill failed");
  });

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
