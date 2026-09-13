import app from "./app.js";
import { env } from "./config/env.js";
import prisma from "./config/prisma.js";

// This file only starts the server; Express configuration lives in app.js.
const httpServer = app.listen(env.port, (error) => {
  if (error) {
    console.error(`Unable to start ResolveAI API: ${error.message}`);
    process.exit(1);
  }

  console.log(`ResolveAI API listening on port ${env.port}`);
});

//gracefull shut down
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);

  httpServer.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      console.error(`HTTP server shutdown failed: ${error.message}`);
      process.exit(1);
    }

    console.log("ResolveAI API stopped cleanly");
    process.exit(0);
  });
}

// Handle the common termination signals used locally and by hosting platforms.
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
