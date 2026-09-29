export function errorHandler(error, _request, response, _next) {
  if (error?.type === "entity.parse.failed") {
    return response.status(400).json({
      success: false,
      message: "Request body must contain valid JSON",
    });
  }

  console.error(error);
  const statusCode = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  return response.status(statusCode).json({
    success: false,
    message: statusCode < 500 ? error.message : "Internal server error",
  });
}
