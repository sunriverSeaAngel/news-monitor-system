import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import newsRouter from "./news";
import tagsRouter from "./tags";
import usersRouter from "./users";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(newsRouter);
router.use(tagsRouter);
router.use(usersRouter);
router.use(analyticsRouter);

export default router;
