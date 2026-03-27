import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { startTelegramBot } from "./lib/telegramBot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Auto-migrate on start
import { sql } from 'drizzle-orm';
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_chat_id TEXT, email TEXT, created_at TIMESTAMP DEFAULT NOW())`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS sources (id SERIAL PRIMARY KEY, name TEXT NOT NULL, rss_url TEXT NOT NULL UNIQUE)`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS tags (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, source_id INTEGER REFERENCES sources(id), title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, published_at TIMESTAMP, summary TEXT, raw_text TEXT, embedding vector(1536))`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS news_tags (news_id INTEGER REFERENCES news(id), tag_id INTEGER REFERENCES tags(id), PRIMARY KEY (news_id, tag_id))`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS user_tag_subscriptions (user_id INTEGER REFERENCES users(id), tag_id INTEGER REFERENCES tags(id), PRIMARY KEY (user_id, tag_id))`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS user_events (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), event_type TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
await db.execute(sql`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL)`);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startTelegramBot();
  startScheduler();
});
