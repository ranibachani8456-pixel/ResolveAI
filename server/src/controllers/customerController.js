import {
  CustomerServiceError,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../services/customerService.js";

function handleCustomerError(error, response) {
  if (error instanceof CustomerServiceError) {
    return response.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Unexpected customer request error", error);
  return response.status(500).json({
    success: false,
    message: "Unable to complete customer request",
  });
}

export async function getCustomers(request, response) {
  try {
    const customers = await listCustomers(request.user.organizationId);
    return response.status(200).json({ success: true, data: { customers } });
  } catch (error) {
    return handleCustomerError(error, response);
  }
}

export async function getCustomerById(request, response) {
  try {
    const customer = await getCustomer(
      request.user.organizationId,
      request.params.customerId,
    );
    return response.status(200).json({ success: true, data: { customer } });
  } catch (error) {
    return handleCustomerError(error, response);
  }
}

export async function createNewCustomer(request, response) {
  try {
    const customer = await createCustomer(request.user.organizationId, request.body);
    return response.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: { customer },
    });
  } catch (error) {
    return handleCustomerError(error, response);
  }
}

export async function updateExistingCustomer(request, response) {
  try {
    const customer = await updateCustomer(
      request.user.organizationId,
      request.params.customerId,
      request.body,
    );
    return response.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: { customer },
    });
  } catch (error) {
    return handleCustomerError(error, response);
  }
}
