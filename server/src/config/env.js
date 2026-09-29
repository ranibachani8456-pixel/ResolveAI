import "dotenv/config";

// Keep environment access in one place so configuration remains easy to extend.
export const env = {
  port: Number(process.env.PORT) || 5001,
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  awsRegion: process.env.AWS_REGION,
  awsS3Bucket: process.env.AWS_S3_BUCKET,
  awsSqsDocumentQueueUrl: process.env.AWS_SQS_DOCUMENT_QUEUE_URL,
  geminiApiKey: process.env.GEMINI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-2",
  embeddingDimension: Number(process.env.EMBEDDING_DIMENSION || 768),
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 20),
  geminiGenerationModel: process.env.GEMINI_GENERATION_MODEL || "gemini-3.8-flash",
  qdrantUrl: process.env.QDRANT_URL,
  qdrantApiKey: process.env.QDRANT_API_KEY,
  qdrantCollection: process.env.QDRANT_COLLECTION || "resolveai_documents",
  ragTopK: Number(process.env.RAG_TOP_K || 5),
  ragContextMaxChars: Number(process.env.RAG_CONTEXT_MAX_CHARS || 6_000),
  ragQuestionMaxChars: Number(process.env.RAG_QUESTION_MAX_CHARS || 2_000),
  aiHistoryMaxMessages: Number(process.env.AI_HISTORY_MAX_MESSAGES || 10),
  aiHistoryMaxChars: Number(process.env.AI_HISTORY_MAX_CHARS || 6_000),
  documentProcessingLeaseSeconds: Number(process.env.DOCUMENT_PROCESSING_LEASE_SECONDS || 240),
};
