import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "./env.js";

let qdrantClient;

// Construct lazily so API-only processes do not require worker configuration.
export function getQdrantClient() {
  if (!env.qdrantUrl || !env.qdrantCollection) {
    throw new Error("Qdrant worker configuration is missing");
  }
  qdrantClient ??= new QdrantClient({
    url: env.qdrantUrl,
    ...(env.qdrantApiKey ? { apiKey: env.qdrantApiKey } : {}),
  });
  return qdrantClient;
}
