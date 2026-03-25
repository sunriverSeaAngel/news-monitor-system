import Parser from "rss-parser";
import OpenAI from "openai";
import { db, sourcesTable, newsTable, tagsTable, newsTagsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const RSS_SOURCES = [
  { name: "Lenta.ru", rssUrl: "https://lenta.ru/rss" },
  { name: "РБК", rssUrl: "https://www.rbc.ru/rss/news" },
];

const ALLOWED_TAGS = ["политика", "экономика", "технологии", "спорт", "общество"] as const;
type AllowedTag = (typeof ALLOWED_TAGS)[number];

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; NewsMonitor/1.0)",
  },
});

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("OPENAI_API_KEY not set — skipping AI enrichment");
    return null;
  }
  return new OpenAI({ apiKey });
}

async function ensureSourceExists(name: string, rssUrl: string): Promise<number> {
  const existing = await db
    .select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(eq(sourcesTable.rssUrl, rssUrl))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [inserted] = await db
    .insert(sourcesTable)
    .values({ name, rssUrl })
    .returning({ id: sourcesTable.id });

  return inserted.id;
}

async function ensureTagsExist(tagNames: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const name of tagNames) {
    const existing = await db
      .select({ id: tagsTable.id })
      .from(tagsTable)
      .where(eq(tagsTable.name, name))
      .limit(1);

    if (existing.length > 0) {
      result.set(name, existing[0].id);
    } else {
      const [inserted] = await db
        .insert(tagsTable)
        .values({ name })
        .returning({ id: tagsTable.id });
      result.set(name, inserted.id);
    }
  }
  return result;
}

async function newsUrlExists(url: string): Promise<boolean> {
  const rows = await db
    .select({ id: newsTable.id })
    .from(newsTable)
    .where(eq(newsTable.url, url))
    .limit(1);
  return rows.length > 0;
}

interface EnrichedArticle {
  tags: AllowedTag[];
  summary: string;
}

async function enrichWithAI(
  openai: OpenAI,
  title: string,
  rawText: string,
): Promise<EnrichedArticle | null> {
  const content = `Заголовок: ${title}\n\nТекст: ${rawText.slice(0, 2000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Ты — редактор новостей. Тебе нужно:
1. Определить один или несколько тегов из списка: политика, экономика, технологии, спорт, общество.
2. Написать краткое саммари новости в 2 предложения на русском языке.

Отвечай строго в JSON формате:
{
  "tags": ["тег1", "тег2"],
  "summary": "Краткое саммари в 2 предложения."
}`,
        },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { tags?: unknown; summary?: unknown };

    const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
      .filter((t): t is AllowedTag => ALLOWED_TAGS.includes(t as AllowedTag));

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

    return { tags: tags.length > 0 ? tags : ["общество"], summary };
  } catch (err) {
    logger.error({ err }, "OpenAI enrichment failed");
    return null;
  }
}

async function processSource(
  openai: OpenAI | null,
  sourceName: string,
  rssUrl: string,
): Promise<number> {
  const sourceId = await ensureSourceExists(sourceName, rssUrl);

  let feed;
  try {
    feed = await rssParser.parseURL(rssUrl);
  } catch (err) {
    logger.error({ err, rssUrl }, "Failed to fetch RSS feed");
    return 0;
  }

  const items = feed.items ?? [];
  let saved = 0;

  for (const item of items) {
    const url = item.link ?? item.guid;
    if (!url) continue;

    const alreadyExists = await newsUrlExists(url);
    if (alreadyExists) continue;

    const title = item.title ?? "(без заголовка)";
    const rawText = item.contentSnippet ?? item.content ?? item.summary ?? "";
    const publishedAt = item.pubDate ? new Date(item.pubDate) : null;

    let summary: string | null = null;
    let tagNames: string[] = [];

    if (openai) {
      const enriched = await enrichWithAI(openai, title, rawText);
      if (enriched) {
        summary = enriched.summary;
        tagNames = enriched.tags;
      }
    }

    const [article] = await db
      .insert(newsTable)
      .values({
        sourceId,
        title,
        url,
        publishedAt,
        summary,
        rawText: rawText.slice(0, 10000),
      })
      .returning({ id: newsTable.id });

    if (tagNames.length > 0) {
      const tagMap = await ensureTagsExist(tagNames);
      const tagIds = tagNames
        .map((n) => tagMap.get(n))
        .filter((id): id is number => id !== undefined);

      if (tagIds.length > 0) {
        await db.insert(newsTagsTable).values(
          tagIds.map((tagId) => ({ newsId: article.id, tagId })),
        );
      }
    }

    saved++;
  }

  return saved;
}

export async function runRssFetch(): Promise<void> {
  logger.info("Starting RSS fetch cycle");
  const openai = getOpenAIClient();

  let totalSaved = 0;
  for (const source of RSS_SOURCES) {
    try {
      const count = await processSource(openai, source.name, source.rssUrl);
      logger.info({ source: source.name, saved: count }, "RSS source processed");
      totalSaved += count;
    } catch (err) {
      logger.error({ err, source: source.name }, "Error processing RSS source");
    }
  }

  logger.info({ totalSaved }, "RSS fetch cycle complete");
}
