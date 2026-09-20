import { createMessage, listMessages, MessageServiceError } from "../services/messageService.js";

function handleMessageError(error, response) {
  if (error instanceof MessageServiceError) {
    return response.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error("Unexpected message request error", error);
  return response.status(500).json({ success: false, message: "Unable to complete message request" });
}

export async function getMessages(request, response) {
  try {
    const messages = await listMessages(request.user.organizationId, request.params.ticketId);
    return response.status(200).json({ success: true, data: { messages } });
  } catch (error) {
    return handleMessageError(error, response);
  }
}

export async function createNewMessage(request, response) {
  try {
    const message = await createMessage(request.user, request.params.ticketId, request.body);
    return response.status(201).json({
      success: true, message: "Message created successfully", data: { message },
    });
  } catch (error) {
    return handleMessageError(error, response);
  }
}
