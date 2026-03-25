import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SetChatIdSchema = z.object({
  user_id: z.string().min(1),
  chat_id: z.string().min(1),
});

router.post("/telegram/set-chat-id", async (req: Request, res: Response) => {
  const parsed = SetChatIdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Требуются поля user_id и chat_id" });
    return;
  }

  const { user_id, chat_id } = parsed.data;

  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, user_id))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    await db
      .update(usersTable)
      .set({ telegramChatId: chat_id })
      .where(eq(usersTable.id, user_id));

    res.json({ success: true, user_id, chat_id });
  } catch (err) {
    req.log.error({ err }, "Error setting chat_id");
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

export default router;
