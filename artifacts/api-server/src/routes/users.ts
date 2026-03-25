import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const CreateUserSchema = z.object({
  telegramChatId: z.string().nullish(),
  email: z.string().email().nullish(),
});

router.post("/users", async (req: Request, res: Response) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }

  const { telegramChatId, email } = parsed.data;

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        telegramChatId: telegramChatId ?? null,
        email: email ?? null,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      telegramChatId: user.telegramChatId ?? null,
      email: user.email ?? null,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }
    req.log.error({ err }, "Error creating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
