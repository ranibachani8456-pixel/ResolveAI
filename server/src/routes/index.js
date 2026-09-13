import { Router } from "express";
import healthRoutes from "./healthRoutes.js";
import databaseHealthRoutes from "./databaseHealthRoutes.js";

const router = Router();

// Each feature owns a router that is mounted beneath the API prefix.
router.use("/health", healthRoutes);
router.use("/db-health", databaseHealthRoutes);

export default router;
