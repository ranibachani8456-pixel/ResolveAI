import "dotenv/config";

// Keep environment access in one place so configuration remains easy to extend.
export const env = {
  port: Number(process.env.PORT) || 5001,
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  awsRegion: process.env.AWS_REGION,
  awsS3Bucket: process.env.AWS_S3_BUCKET,
  awsSqsDocumentQueueUrl: process.env.AWS_SQS_DOCUMENT_QUEUE_URL,
  geminiApiKey: process.env.GEMINI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-2",
  embeddingDimension: Number(process.env.EMBEDDING_DIMENSION || 768),
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 20),
  qdrantUrl: process.env.QDRANT_URL,
  qdrantApiKey: process.env.QDRANT_API_KEY,
  qdrantCollection: process.env.QDRANT_COLLECTION || "resolveai_documents",
  documentProcessingLeaseSeconds: Number(process.env.DOCUMENT_PROCESSING_LEASE_SECONDS || 240),
};
