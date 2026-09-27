import { Router } from "express";
import { askQuestion } from "../controllers/aiController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

router.use(authMiddleware);
router.post(
  "/ask",
  authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"),
  askQuestion,
);

export default router;
