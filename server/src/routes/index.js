import { Router } from "express";
import healthRoutes from "./healthRoutes.js";
import databaseHealthRoutes from "./databaseHealthRoutes.js";
import authRoutes from "./authRoutes.js";

const router = Router();

// Each feature owns a router that is mounted beneath the API prefix.
router.use("/health", healthRoutes);
router.use("/db-health", databaseHealthRoutes);
router.use("/auth", authRoutes);

export default router;
