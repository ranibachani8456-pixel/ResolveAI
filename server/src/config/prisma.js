import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Centralizing PrismaClient creates one shared connection pool for the API.
// Import this instance wherever database access is needed instead of creating new clients.
const prisma = new PrismaClient();

export default prisma;
