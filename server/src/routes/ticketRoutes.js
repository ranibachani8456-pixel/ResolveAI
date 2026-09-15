import { Router } from "express";
import {
  createNewTicket,
  getTicketById,
  getTickets,
  updateExistingTicket,
} from "../controllers/ticketController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();
const writeRoles = authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT");

router.use(authMiddleware);

router.get("/", getTickets);
router.get("/:ticketId", getTicketById);
router.post("/", writeRoles, createNewTicket);
router.patch("/:ticketId", writeRoles, updateExistingTicket);

export default router;
