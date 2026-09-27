export function errorHandler(error, _request, response, _next) {
  if (error?.type === "entity.parse.failed") {
    return response.status(400).json({
      success: false,
      message: "Request body must contain valid JSON",
    });
  }

  console.error(error);

  return response.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });
}
