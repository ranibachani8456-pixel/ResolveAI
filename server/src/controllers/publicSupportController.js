import {
  PublicSupportServiceError,
  submitPublicSupportRequest,
} from "../services/publicSupportService.js";

export async function createPublicSupportTicket(request, response) {
  try {
    const result = await submitPublicSupportRequest(
      request.params.organizationSlug,
      request.body,
      request.app?.locals?.publicSupportDatabase,
    );
    return response.status(201).json({
      success: true,
      message: "Support request submitted successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof PublicSupportServiceError) {
      return response.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error(`Unexpected public support request failure: error=${error?.name || "Error"}`);
    return response.status(500).json({
      success: false,
      message: "Unable to submit support request",
    });
  }
}
