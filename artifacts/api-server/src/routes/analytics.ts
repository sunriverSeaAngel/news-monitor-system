import { Router, type IRouter, type Request, type Response } from "express";
import { db, newsTable, tagsTable, newsTagsTable, userEventsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const newsByDayRows = await db
      .select({
        date: sql<string>`to_char(${newsTable.publishedAt}::date, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(newsTable)
      .where(sql`${newsTable.publishedAt} IS NOT NULL AND ${newsTable.publishedAt} >= now() - interval '30 days'`)
      .groupBy(sql`${newsTable.publishedAt}::date`)
      .orderBy(sql`${newsTable.publishedAt}::date`);

    const topTagsRows = await db
      .select({
        tag: tagsTable.name,
        count: sql<number>`count(${newsTagsTable.newsId})::int`,
      })
      .from(tagsTable)
      .leftJoin(newsTagsTable, sql`${newsTagsTable.tagId} = ${tagsTable.id}`)
      .groupBy(tagsTable.id, tagsTable.name)
      .orderBy(sql`count(${newsTagsTable.newsId}) desc`)
      .limit(10);

    const funnelRows = await db
      .select({
        eventType: userEventsTable.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(userEventsTable)
      .groupBy(userEventsTable.eventType)
      .orderBy(sql`count(*) desc`);

    res.json({
      newsByDay: newsByDayRows.map((r) => ({
        date: r.date ?? "",
        count: r.count,
      })),
      topTags: topTagsRows.map((r) => ({
        tag: r.tag,
        count: r.count,
      })),
      eventFunnel: funnelRows.map((r) => ({
        eventType: r.eventType,
        count: r.count,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
