import { Router } from "express";
import { getDocumentById, getDocuments, uploadNewDocument } from "../controllers/documentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { uploadSingleDocument } from "../middleware/documentUpload.js";

const router = Router();
router.use(authMiddleware);
router.get("/", authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"), getDocuments);
router.get("/:documentId", authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"), getDocumentById);
router.post("/", authorizeRoles("OWNER", "ADMIN"), uploadSingleDocument, uploadNewDocument);
export default router;
