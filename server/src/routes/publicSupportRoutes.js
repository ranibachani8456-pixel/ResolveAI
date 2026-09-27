import { Router } from "express";
import { createPublicSupportTicket } from "../controllers/publicSupportController.js";

const router = Router();

// This route is intentionally public; it exposes only the narrow support-intake operation.
router.post("/support/:organizationSlug/tickets", createPublicSupportTicket);

export default router;
