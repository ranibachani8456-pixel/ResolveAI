import prisma from "../config/prisma.js";

export async function getDatabaseHealth(_request, response) {
  try {
    // A tiny read-only query verifies that MySQL accepts a real database request.
    await prisma.$queryRaw`SELECT 1`;

    response.status(200).json({
      success: true,
      message: "Database connection successful",
    });
  } catch (error) {
    // Log details for developers, but never expose credentials or connection data.
    console.error("Database health check failed:", error.message);

    response.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
}
