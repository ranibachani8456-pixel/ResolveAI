import { Router } from "express";
import healthRoutes from "./healthRoutes.js";

const router = Router();

// Each feature owns a router that is mounted beneath the API prefix.
router.use("/health", healthRoutes);

export default router;
