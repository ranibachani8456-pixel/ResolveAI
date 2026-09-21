export class PermanentDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentDocumentError";
  }
}

export class DocumentProcessingBusyError extends Error {
  constructor(message = "Document processing is already leased by another worker") {
    super(message);
    this.name = "DocumentProcessingBusyError";
  }
}
