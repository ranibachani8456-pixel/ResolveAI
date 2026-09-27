import { answerKnowledgeQuestion, RagServiceError } from "../services/ragService.js";

export async function askQuestion(request, response) {
  try {
    const result = await answerKnowledgeQuestion(
      request.user,
      request.body,
      request.app?.locals?.ragDependencies,
    );
    return response.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof RagServiceError) {
      if (error.statusCode >= 500) {
        console.error(
          `AI request failed: stage=${error.stage} error=${error.cause?.name || "Error"}`,
        );
      }
      return response.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error(`Unexpected AI request failure: error=${error?.name || "Error"}`);
    return response.status(500).json({ success: false, message: "Unable to complete AI request" });
  }
}
