import OpenAI from "openai";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const openai = getOpenAIClient();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping embedding generation");
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    logger.error({ err }, "Failed to generate embedding");
    return null;
  }
}

export async function saveEmbedding(newsId: number, embedding: number[]): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await pool.query(
    "UPDATE news SET embedding = $1::vector WHERE id = $2",
    [vectorStr, newsId],
  );
}

export interface SimilarArticle {
  id: number;
  title: string;
  url: string;
  summary: string | null;
  similarity: number;
}

export async function findSimilarNews(
  embedding: number[],
  limit = 5,
): Promise<SimilarArticle[]> {
  const vectorStr = `[${embedding.join(",")}]`;
  const result = await pool.query<SimilarArticle & { similarity: number }>(
    `SELECT id, title, url, summary,
            1 - (embedding <=> $1::vector) AS similarity
     FROM news
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorStr, limit],
  );
  return result.rows;
}

export async function answerWithContext(
  question: string,
  context: SimilarArticle[],
): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) return "OpenAI API недоступен.";

  const contextText = context
    .map((a, i) =>
      `[${i + 1}] ${a.title}\n${a.summary ?? "(нет саммари)"}\nИсточник: ${a.url}`,
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Ты — новостной ассистент. Отвечай на вопросы пользователя строго на основе предоставленных новостных статей. " +
          "Если ответа нет в контексте — честно скажи об этом. Отвечай на русском языке.",
      },
      {
        role: "user",
        content: `Контекст (последние новости):\n\n${contextText}\n\nВопрос: ${question}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });

  return response.choices[0]?.message?.content ?? "Не удалось получить ответ.";
}
