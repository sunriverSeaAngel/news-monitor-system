import { Router, type IRouter, type Request, type Response } from "express";
import { db, tagsTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/tags", async (req: Request, res: Response) => {
  try {
    const tags = await db
      .select({ id: tagsTable.id, name: tagsTable.name })
      .from(tagsTable)
      .orderBy(asc(tagsTable.name));

    res.json({ data: tags });
  } catch (err) {
    req.log.error({ err }, "Error fetching tags");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
