import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import leavesRouter from "./leaves";
import insightsRouter from "./insights";
import payrollRouter from "./payroll";
import shiftsRouter from "./shifts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(leavesRouter);
router.use(insightsRouter);
router.use(payrollRouter);
router.use(shiftsRouter);

export default router;
