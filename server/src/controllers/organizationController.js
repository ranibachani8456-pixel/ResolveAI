import {
  OrganizationServiceError,
  createOrganizationUser,
  getOrganization,
  listOrganizationUsers,
  updateOrganizationUserRole,
} from "../services/organizationService.js";

function handleOrganizationError(error, response) {
  if (error instanceof OrganizationServiceError) {
    return response.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Unexpected organization request error", error);
  return response.status(500).json({
    success: false,
    message: "Unable to complete organization request",
  });
}

export async function getCurrentOrganization(request, response) {
  try {
    const organization = await getOrganization(request.user.organizationId);

    return response.status(200).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    return handleOrganizationError(error, response);
  }
}

export async function getOrganizationUsers(request, response) {
  try {
    const users = await listOrganizationUsers(request.user.organizationId);

    return response.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    return handleOrganizationError(error, response);
  }
}

export async function createUser(request, response) {
  try {
    const user = await createOrganizationUser(request.user.organizationId, request.body);

    return response.status(201).json({
      success: true,
      message: "Organization user created successfully",
      data: { user },
    });
  } catch (error) {
    return handleOrganizationError(error, response);
  }
}

export async function updateUserRole(request, response) {
  try {
    const user = await updateOrganizationUserRole(
      request.user.organizationId,
      request.params.userId,
      request.body,
    );

    return response.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: { user },
    });
  } catch (error) {
    return handleOrganizationError(error, response);
  }
}
