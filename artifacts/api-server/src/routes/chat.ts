import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { generateEmbedding, findSimilarNews, answerWithContext } from "../lib/rag";

const router: IRouter = Router();

const ChatSchema = z.object({
  question: z.string().min(1).max(1000),
});

router.post("/chat", async (req: Request, res: Response) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Поле question обязательно (строка до 1000 символов)" });
    return;
  }

  const { question } = parsed.data;

  try {
    const embedding = await generateEmbedding(question);
    if (!embedding) {
      res.status(503).json({ error: "Сервис эмбеддингов недоступен" });
      return;
    }

    const similar = await findSimilarNews(embedding, 5);

    if (similar.length === 0) {
      res.json({
        answer: "В базе пока нет новостей с эмбеддингами. Дождитесь следующего обхода RSS.",
        sources: [],
      });
      return;
    }

    const answer = await answerWithContext(question, similar);

    res.json({
      answer,
      sources: similar.map((a) => ({ title: a.title, url: a.url })),
    });
  } catch (err) {
    req.log.error({ err }, "Error in /chat handler");
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

export default router;
