import {
  AuthConfigurationError,
  AuthServiceError,
  getCurrentUser,
  login,
  loginWithGoogle,
  register,
} from "../services/authService.js";
import { JwtConfigurationError } from "../utils/jwt.js";
import { GoogleIdentityConfigurationError } from "../services/googleIdentityService.js";

function handleAuthError(error, response) {
  if (error instanceof AuthServiceError) {
    return response.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }

  if (
    error instanceof AuthConfigurationError ||
    error instanceof JwtConfigurationError ||
    error instanceof GoogleIdentityConfigurationError
  ) {
    console.error(`Authentication configuration error: ${error.message}`);
    return response.status(500).json({
      success: false,
      message: "Authentication service is not configured",
    });
  }

  console.error("Unexpected authentication error", error);
  return response.status(500).json({
    success: false,
    message: "Unable to complete authentication request",
  });
}

export async function registerUser(request, response) {
  try {
    const result = await register(request.body);

    return response.status(201).json({
      success: true,
      message: "Registration successful",
      data: result,
    });
  } catch (error) {
    return handleAuthError(error, response);
  }
}

export async function loginUser(request, response) {
  try {
    const result = await login(request.body);

    return response.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    return handleAuthError(error, response);
  }
}

export async function loginGoogleUser(request, response) {
  try {
    const result = await loginWithGoogle(
      request.body,
      request.app?.locals?.googleAuthDependencies,
    );
    return response.status(200).json({
      success: true,
      message: "Google login successful",
      data: result,
    });
  } catch (error) {
    return handleAuthError(error, response);
  }
}

export async function getMe(request, response) {
  try {
    const user = await getCurrentUser(request.user);

    return response.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return handleAuthError(error, response);
  }
}
