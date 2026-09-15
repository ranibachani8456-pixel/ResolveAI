import { Router } from "express";
import {
  createUser,
  getCurrentOrganization,
  getOrganizationUsers,
  updateUserRole,
} from "../controllers/organizationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

// Every organization route requires a verified JWT before role checks run.
router.use(authMiddleware);

router.get("/", getCurrentOrganization);
router.get("/users", authorizeRoles("OWNER", "ADMIN"), getOrganizationUsers);
router.post("/users", authorizeRoles("OWNER", "ADMIN"), createUser);
router.patch("/users/:userId/role", authorizeRoles("OWNER"), updateUserRole);

export default router;
