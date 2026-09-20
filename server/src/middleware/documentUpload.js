import multer from "multer";
import { MAX_DOCUMENT_SIZE_BYTES } from "../utils/documentLimits.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_SIZE_BYTES,
    files: 1,
    fields: 5,
    parts: 6,
    fieldSize: 1024,
  },
});

// Convert Multer's internal errors into stable, non-sensitive API responses.
export function uploadSingleDocument(request, response, next) {
  upload.single("file")(request, response, (error) => {
    if (!error) return next();

    if (error.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({
        success: false,
        message: "Document must not exceed 10 MB",
      });
    }

    if (error instanceof multer.MulterError) {
      return response.status(400).json({
        success: false,
        message: "Upload exactly one file using the file field",
      });
    }

    console.error("Unexpected multipart upload error", error);
    return response.status(400).json({ success: false, message: "Invalid document upload" });
  });
}
