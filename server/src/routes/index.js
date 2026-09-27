import { Router } from "express";
import healthRoutes from "./healthRoutes.js";
import databaseHealthRoutes from "./databaseHealthRoutes.js";
import authRoutes from "./authRoutes.js";
import organizationRoutes from "./organizationRoutes.js";
import customerRoutes from "./customerRoutes.js";
import ticketRoutes from "./ticketRoutes.js";
import messageRoutes from "./messageRoutes.js";
import documentRoutes from "./documentRoutes.js";
import aiRoutes from "./aiRoutes.js";
import publicSupportRoutes from "./publicSupportRoutes.js";

const router = Router();

// Each feature owns a router that is mounted beneath the API prefix.
router.use("/health", healthRoutes);
router.use("/db-health", databaseHealthRoutes);
router.use("/auth", authRoutes);
router.use("/public", publicSupportRoutes);
router.use("/organization", organizationRoutes);
router.use("/customers", customerRoutes);
router.use("/documents", documentRoutes);
router.use("/ai", aiRoutes);
router.use("/tickets/:ticketId/messages", messageRoutes);
router.use("/tickets", ticketRoutes);

export default router;
