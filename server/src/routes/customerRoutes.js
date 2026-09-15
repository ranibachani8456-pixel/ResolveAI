import { Router } from "express";
import {
  createNewCustomer,
  getCustomerById,
  getCustomers,
  updateExistingCustomer,
} from "../controllers/customerController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();
const writeRoles = authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT");

router.use(authMiddleware);

router.get("/", getCustomers);
router.get("/:customerId", getCustomerById);
router.post("/", writeRoles, createNewCustomer);
router.patch("/:customerId", writeRoles, updateExistingCustomer);

export default router;
