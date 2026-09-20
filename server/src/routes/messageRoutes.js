import { Router } from "express";
import { getMessages, createNewMessage } from "../controllers/messageController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

// Preserve ticketId from the parent mount path in this feature's own router.
const router = Router({ mergeParams: true });
router.use(authMiddleware);
router.get("/", authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"), getMessages);
router.post("/", authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT"), createNewMessage);
export default router;
