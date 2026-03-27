import TelegramBot from "node-telegram-bot-api";
import { db, usersTable, newsTable, tagsTable, newsTagsTable, userTagSubscriptionsTable, sourcesTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

let botInstance: TelegramBot | null = null;

export function getBot(): TelegramBot | null {
  return botInstance;
}

async function upsertUserByChatId(chatId: string): Promise<void> {
  await db
    .insert(usersTable)
    .values({ telegramChatId: chatId })
    .onConflictDoNothing();

  await db
    .update(usersTable)
    .set({ telegramChatId: chatId })
    .where(eq(usersTable.telegramChatId, chatId));
}

async function getUserByChatId(chatId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramChatId, chatId))
    .limit(1);
  return rows[0] ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function buildDigest(userId: string): Promise<string> {
  const subscriptions = await db
    .select({ tagId: userTagSubscriptionsTable.tagId })
    .from(userTagSubscriptionsTable)
    .where(eq(userTagSubscriptionsTable.userId, userId));

  let articleIds: number[];

  if (subscriptions.length > 0) {
    const tagIds = subscriptions.map((s) => s.tagId);
    const rows = await db
      .select({ newsId: newsTagsTable.newsId })
      .from(newsTagsTable)
      .where(inArray(newsTagsTable.tagId, tagIds));
    articleIds = [...new Set(rows.map((r) => r.newsId))];
  } else {
    articleIds = [];
  }

  let articles;
  if (articleIds.length > 0) {
    articles = await db
      .select({
        id: newsTable.id,
        title: newsTable.title,
        url: newsTable.url,
        summary: newsTable.summary,
        sourceName: sourcesTable.name,
      })
      .from(newsTable)
      .leftJoin(sourcesTable, eq(sourcesTable.id, newsTable.sourceId))
      .where(inArray(newsTable.id, articleIds))
      .orderBy(desc(newsTable.publishedAt))
      .limit(5);
  } else {
    articles = await db
      .select({
        id: newsTable.id,
        title: newsTable.title,
        url: newsTable.url,
        summary: newsTable.summary,
        sourceName: sourcesTable.name,
      })
      .from(newsTable)
      .leftJoin(sourcesTable, eq(sourcesTable.id, newsTable.sourceId))
      .orderBy(desc(newsTable.publishedAt))
      .limit(5);
  }

  if (articles.length === 0) {
    return "📭 Новостей пока нет. Попробуйте позже.";
  }

  const tagMap = new Map<number, string[]>();
  const ids = articles.map((a) => a.id);
  const tagRows = await db
    .select({ newsId: newsTagsTable.newsId, tagName: tagsTable.name })
    .from(newsTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, newsTagsTable.tagId))
    .where(inArray(newsTagsTable.newsId, ids));

  for (const row of tagRows) {
    if (!tagMap.has(row.newsId)) tagMap.set(row.newsId, []);
    tagMap.get(row.newsId)!.push(row.tagName);
  }

  const lines: string[] = ["📰 <b>Дайджест новостей</b>\n"];
  for (const a of articles) {
    const tags = tagMap.get(a.id)?.join(", ") ?? "";
    lines.push(`<b>${escapeHtml(a.title)}</b>`);
    if (a.sourceName) lines.push(`📡 ${escapeHtml(a.sourceName)}`);
    if (tags) lines.push(`🏷 ${escapeHtml(tags)}`);
    if (a.summary) lines.push(`<i>${escapeHtml(a.summary)}</i>`);
    lines.push(`🔗 <a href="${escapeHtml(a.url)}">Читать далее</a>`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function sendDigestToAll(): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const users = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.telegramChatId} IS NOT NULL`);

  logger.info({ count: users.length }, "Sending daily digest to all users");

  for (const user of users) {
    if (!user.telegramChatId) continue;
    try {
      const text = await buildDigest(user.id);
      await bot.sendMessage(user.telegramChatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to send digest");
    }
  }
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });
  botInstance = bot;

  logger.info("Telegram bot started");

  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name ?? "пользователь";

    try {
      await upsertUserByChatId(chatId);
      await bot.sendMessage(
        chatId,
        `👋 Привет, ${firstName}!\n\n` +
        `Я бот для мониторинга новостей. Вот что я умею:\n\n` +
        `/digest — получить последние 5 новостей\n` +
        `/tags — список доступных тегов\n\n` +
        `Каждый день в 9:00 по Москве я буду присылать тебе дайджест автоматически.`,
      );
    } catch (err) {
      logger.error({ err, chatId }, "Error in /start handler");
    }
  });

  bot.onText(/\/tags/, async (msg) => {
    const chatId = String(msg.chat.id);
    try {
      const tags = await db
        .select({ name: tagsTable.name })
        .from(tagsTable)
        .orderBy(tagsTable.name);

      if (tags.length === 0) {
        await bot.sendMessage(chatId, "🏷 Теги пока не загружены. Попробуйте позже.");
        return;
      }

      const tagList = tags.map((t) => `• ${t.name}`).join("\n");
      await bot.sendMessage(
        chatId,
        `🏷 <b>Доступные теги:</b>\n\n${tagList}`,
        { parse_mode: "HTML" },
      );
    } catch (err) {
      logger.error({ err, chatId }, "Error in /tags handler");
    }
  });

  bot.onText(/\/digest/, async (msg) => {
    const chatId = String(msg.chat.id);
    try {
      let user = await getUserByChatId(chatId);
      if (!user) {
        await upsertUserByChatId(chatId);
        user = await getUserByChatId(chatId);
      }

      if (!user) {
        await bot.sendMessage(chatId, "❌ Не удалось найти пользователя. Попробуйте /start.");
        return;
      }

      await bot.sendMessage(chatId, "⏳ Формирую дайджест...");
      const text = await buildDigest(user.id);
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error({ err, chatId }, "Error in /digest handler");
      await bot.sendMessage(chatId, "❌ Не удалось получить дайджест. Попробуйте позже.").catch(() => {});
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });
}
