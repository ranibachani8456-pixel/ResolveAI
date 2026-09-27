import { Router } from "express";
import { askQuestion } from "../controllers/aiController.js";
import {
  createConversation,
  createConversationMessage,
  getConversationById,
  getConversations,
} from "../controllers/aiConversationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();
const readOnlyAIRoles = authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER");

router.use(authMiddleware);
router.post("/ask", readOnlyAIRoles, askQuestion);
router.post("/conversations", readOnlyAIRoles, createConversation);
router.get("/conversations", readOnlyAIRoles, getConversations);
router.get("/conversations/:conversationId", readOnlyAIRoles, getConversationById);
router.post(
  "/conversations/:conversationId/messages",
  readOnlyAIRoles,
  createConversationMessage,
);

export default router;
