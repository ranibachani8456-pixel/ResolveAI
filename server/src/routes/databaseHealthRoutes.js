import { Router } from "express";
import { getDatabaseHealth } from "../controllers/databaseHealthController.js";

const router = Router();

router.get("/", getDatabaseHealth);

export default router;
