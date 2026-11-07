import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import thoughtsRouter from "./thoughts";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(thoughtsRouter);
router.use(notificationsRouter);

export default router;
