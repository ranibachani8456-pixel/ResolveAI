import { Router } from "express";
import {
  getMe,
  loginGoogleUser,
  loginUser,
  registerUser,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", loginGoogleUser);
router.get("/me", authMiddleware, getMe);

export default router;
