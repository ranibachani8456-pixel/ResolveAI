import "dotenv/config";
// after installing npm install dotenv we can use this package to load environment variables from a .env file into process.env. This is useful for keeping sensitive information like database credentials and API keys out of the source code.
// Load the dotenv package’s config behavior immediately.

import { PrismaClient } from "@prisma/client";

// Centralizing PrismaClient creates one shared connection pool for the API.
// Import this instance wherever database access is needed instead of creating new clients.
const prisma = new PrismaClient();

export default prisma;
