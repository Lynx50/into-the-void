import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import thoughtsRouter from "./thoughts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(thoughtsRouter);

export default router;
