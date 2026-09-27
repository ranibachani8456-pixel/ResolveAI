import { RagServiceError } from "../services/ragService.js";
import {
  AIConversationServiceError,
  createAIConversation,
  getAIConversation,
  listAIConversations,
  sendAIConversationMessage,
} from "../services/aiConversationService.js";

function dependencies(request) {
  return {
    ...(request.app?.locals?.aiConversationDependencies ?? {}),
    ragDependencies:
      request.app?.locals?.aiConversationDependencies?.ragDependencies ??
      request.app?.locals?.ragDependencies,
  };
}

function handleConversationError(error, response) {
  if (error instanceof AIConversationServiceError || error instanceof RagServiceError) {
    if (error.statusCode >= 500) {
      console.error(
        `AI conversation request failed: stage=${error.stage || "persistence"} error=${error.cause?.name || error.name}`,
      );
    }
    return response.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(`Unexpected AI conversation request failure: error=${error?.name || "Error"}`);
  return response.status(500).json({
    success: false,
    message: "Unable to complete AI conversation request",
  });
}

export async function createConversation(request, response) {
  try {
    const conversation = await createAIConversation(
      request.user,
      request.body,
      dependencies(request),
    );
    return response.status(201).json({
      success: true,
      message: "Conversation created successfully",
      data: { conversation },
    });
  } catch (error) {
    return handleConversationError(error, response);
  }
}

export async function getConversations(request, response) {
  try {
    const conversations = await listAIConversations(request.user, dependencies(request));
    return response.status(200).json({ success: true, data: { conversations } });
  } catch (error) {
    return handleConversationError(error, response);
  }
}

export async function getConversationById(request, response) {
  try {
    const conversation = await getAIConversation(
      request.user,
      request.params.conversationId,
      dependencies(request),
    );
    return response.status(200).json({ success: true, data: { conversation } });
  } catch (error) {
    return handleConversationError(error, response);
  }
}

export async function createConversationMessage(request, response) {
  try {
    const result = await sendAIConversationMessage(
      request.user,
      request.params.conversationId,
      request.body,
      dependencies(request),
    );
    return response.status(201).json({
      success: true,
      message: "Conversation message created successfully",
      data: result,
    });
  } catch (error) {
    return handleConversationError(error, response);
  }
}
