import { Router, type IRouter, type Request, type Response } from "express";
import { db, newsTable, sourcesTable, tagsTable, newsTagsTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/news", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const tagFilter = req.query.tag ? String(req.query.tag) : null;
  const sourceIdFilter = req.query.source_id ? parseInt(String(req.query.source_id), 10) : null;

  try {
    let newsIds: number[] | null = null;

    if (tagFilter) {
      const tagRows = await db
        .select({ newsId: newsTagsTable.newsId })
        .from(newsTagsTable)
        .innerJoin(tagsTable, eq(tagsTable.id, newsTagsTable.tagId))
        .where(eq(tagsTable.name, tagFilter));
      newsIds = tagRows.map((r) => r.newsId);
      if (newsIds.length === 0) {
        res.json({ data: [], total: 0, page, limit });
        return;
      }
    }

    const baseQuery = db
      .select({
        id: newsTable.id,
        title: newsTable.title,
        url: newsTable.url,
        publishedAt: newsTable.publishedAt,
        summary: newsTable.summary,
        sourceId: newsTable.sourceId,
        sourceName: sourcesTable.name,
        sourceRssUrl: sourcesTable.rssUrl,
      })
      .from(newsTable)
      .leftJoin(sourcesTable, eq(sourcesTable.id, newsTable.sourceId))
      .$dynamic();

    const conditions = [];
    if (newsIds !== null) {
      conditions.push(inArray(newsTable.id, newsIds));
    }
    if (sourceIdFilter !== null && !isNaN(sourceIdFilter)) {
      conditions.push(eq(newsTable.sourceId, sourceIdFilter));
    }

    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(newsTable)
      .$dynamic();

    let articles;
    let totalResult;

    if (conditions.length > 0) {
      const { and } = await import("drizzle-orm");
      const whereClause = and(...conditions);
      articles = await baseQuery
        .where(whereClause)
        .orderBy(desc(newsTable.publishedAt))
        .limit(limit)
        .offset(offset);
      totalResult = await countQuery.where(whereClause);
    } else {
      articles = await baseQuery
        .orderBy(desc(newsTable.publishedAt))
        .limit(limit)
        .offset(offset);
      totalResult = await countQuery;
    }

    const total = totalResult[0]?.count ?? 0;

    if (articles.length === 0) {
      res.json({ data: [], total, page, limit });
      return;
    }

    const ids = articles.map((a) => a.id);
    const tagRows = await db
      .select({
        newsId: newsTagsTable.newsId,
        tagId: tagsTable.id,
        tagName: tagsTable.name,
      })
      .from(newsTagsTable)
      .innerJoin(tagsTable, eq(tagsTable.id, newsTagsTable.tagId))
      .where(inArray(newsTagsTable.newsId, ids));

    const tagsByNewsId = new Map<number, { id: number; name: string }[]>();
    for (const row of tagRows) {
      if (!tagsByNewsId.has(row.newsId)) tagsByNewsId.set(row.newsId, []);
      tagsByNewsId.get(row.newsId)!.push({ id: row.tagId, name: row.tagName });
    }

    const data = articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      summary: a.summary ?? null,
      source: a.sourceId
        ? { id: a.sourceId, name: a.sourceName!, rssUrl: a.sourceRssUrl ?? null }
        : null,
      tags: tagsByNewsId.get(a.id) ?? [],
    }));

    res.json({ data, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "Error fetching news");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
