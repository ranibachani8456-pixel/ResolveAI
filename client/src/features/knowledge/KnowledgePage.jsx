import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentApi } from "../../api/documentApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canUploadDocuments } from "../../constants/roles.js";
import { formatDateTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import Badge from "../../components/common/Badge.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import Skeleton from "../../components/feedback/Skeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);
const ACTIVE_STATUSES = new Set(["PENDING", "PROCESSING"]);

export function validateDocumentFile(file) {
  if (!file) return "Choose a PDF or plain-text document.";
  if (!ALLOWED_TYPES.has(file.type)) return "Only PDF and plain-text documents are supported.";
  if (file.size === 0) return "The selected document is empty.";
  if (file.size > MAX_FILE_SIZE) return "Document must not exceed 10 MB.";
  return "";
}

export function shouldPollDocuments(documents) {
  return documents.some(({ status }) => ACTIVE_STATUSES.has(status));
}

const DocumentRow = memo(function DocumentRow({ document, onPreview }) {
  return (
    <div className="data-row document-row">
      <div className="document-icon"><Icon name="knowledge" size={19} /></div>
      <div className="data-row__primary"><div><strong>{document.fileName}</strong><span>{document.mimeType === "application/pdf" ? "PDF document" : "Plain text"} · ID #{document.id}</span></div></div>
      <Badge value={document.status} />
      <time>{formatDateTime(document.createdAt)}</time>
      <span className="document-state-copy">{document.status === "READY" ? "Available to AI" : document.status === "FAILED" ? "Processing failed" : "Preparing knowledge"}</span>
      <Button variant="secondary" size="small" icon="eye" onClick={() => onPreview(document)} aria-label={`Preview ${document.fileName}`}>Preview</Button>
    </div>
  );
});

export default function KnowledgePage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState({ loading: true, error: "", documents: [] });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState({ open: false, document: null, loading: false, error: "", text: "", url: "" });
  const fileInput = useRef(null);
  const previewRequest = useRef(null);
  const previewObjectUrl = useRef("");

  const load = useCallback(() => {
    const controller = new AbortController();
    documentApi.list(controller.signal).then((response) => setState({ loading: false, error: "", documents: response.data.documents })).catch((error) => {
      if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return controller;
  }, []);
  useEffect(() => { const controller = load(); return () => controller.abort(); }, [load]);

  const releasePreviewUrl = useCallback(() => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = "";
    }
  }, []);

  const closePreview = useCallback(() => {
    previewRequest.current?.abort();
    previewRequest.current = null;
    releasePreviewUrl();
    setPreview({ open: false, document: null, loading: false, error: "", text: "", url: "" });
  }, [releasePreviewUrl]);

  const openPreview = useCallback(async (document) => {
    previewRequest.current?.abort();
    releasePreviewUrl();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreview({ open: true, document, loading: true, error: "", text: "", url: "" });
    try {
      const blob = await documentApi.preview(document.id, controller.signal);
      if (previewRequest.current !== controller) return;
      if (document.mimeType === "text/plain") {
        const text = await blob.text();
        if (previewRequest.current === controller) {
          setPreview({ open: true, document, loading: false, error: "", text, url: "" });
        }
      } else {
        const url = URL.createObjectURL(blob);
        previewObjectUrl.current = url;
        setPreview({ open: true, document, loading: false, error: "", text: "", url });
      }
    } catch (error) {
      if (error.name !== "AbortError" && previewRequest.current === controller) {
        setPreview({ open: true, document, loading: false, error: error.message, text: "", url: "" });
      }
    } finally {
      if (previewRequest.current === controller) previewRequest.current = null;
    }
  }, [releasePreviewUrl]);

  useEffect(() => () => {
    previewRequest.current?.abort();
    releasePreviewUrl();
  }, [releasePreviewUrl]);

  const pollingKey = useMemo(() => state.documents.filter(({ status }) => ACTIVE_STATUSES.has(status)).map(({ id, status }) => `${id}:${status}`).join("|"), [state.documents]);
  useEffect(() => {
    if (!pollingKey) return undefined;
    let stopped = false;
    let timer;
    let requestController;
    let attempts = 0;

    const schedule = () => {
      if (stopped || attempts >= 24) return;
      timer = window.setTimeout(async () => {
        if (stopped) return;
        attempts += 1;
        requestController = new AbortController();
        try {
          const response = await documentApi.list(requestController.signal);
          if (stopped) return;
          const documents = response.data.documents;
          setState((current) => ({ ...current, documents }));
          if (shouldPollDocuments(documents)) schedule();
        } catch (error) {
          if (!stopped && error.name !== "AbortError") schedule();
        }
      }, 5_000);
    };
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      requestController?.abort();
    };
  }, [pollingKey]);

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setFileError(validateDocumentFile(selected));
  };

  const upload = async (event) => {
    event.preventDefault();
    if (uploading) return;
    const validationError = validateDocumentFile(file);
    if (validationError) { setFileError(validationError); return; }
    setUploading(true);
    try {
      const response = await documentApi.upload(file);
      setState((current) => ({ ...current, documents: [response.data.document, ...current.documents] }));
      notify("Document uploaded and queued for processing.", "success");
      setUploadOpen(false); setFile(null); setFileError("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      setFileError(error.message);
    } finally {
      setUploading(false);
    }
  };

  if (state.loading) return <PageSkeleton />;
  if (state.error) return <ErrorState title="Unable to load knowledge base" message={state.error} onRetry={load} />;
  const readyCount = state.documents.filter(({ status }) => status === "READY").length;
  return (
    <div className="page">
      <PageHeader eyebrow="Grounded knowledge" title="Knowledge base" description="Documents become searchable by the support assistant after secure processing completes." actions={canUploadDocuments(user.role) ? <Button icon="upload" onClick={() => setUploadOpen(true)}>Upload document</Button> : null} />
      <section className="knowledge-summary"><div><strong>{readyCount}</strong><span>Ready for answers</span></div><div><strong>{state.documents.filter(({ status }) => ACTIVE_STATUSES.has(status)).length}</strong><span>Processing</span></div><div><strong>{state.documents.filter(({ status }) => status === "FAILED").length}</strong><span>Need attention</span></div><p><span className="status-dot" />Status refreshes every five seconds while processing, for up to two minutes.</p></section>
      <section className="data-list" aria-label="Knowledge documents">
        <div className="data-list__header document-row"><span /><span>Document</span><span>Status</span><span>Uploaded</span><span>Availability</span><span>Preview</span></div>
        {state.documents.length ? state.documents.map((document) => <DocumentRow document={document} onPreview={openPreview} key={document.id} />) : <EmptyState title="No knowledge documents" description={canUploadDocuments(user.role) ? "Upload a PDF or text file to ground AI answers." : "An owner or admin can upload documents for this workspace."} action={canUploadDocuments(user.role) ? <Button icon="upload" onClick={() => setUploadOpen(true)}>Upload first document</Button> : null} />}
      </section>
      <Modal open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} title="Upload knowledge" description="Files are stored privately and processed asynchronously." footer={<><Button variant="secondary" disabled={uploading} onClick={() => setUploadOpen(false)}>Cancel</Button><Button form="upload-document-form" type="submit" loading={uploading}>Upload document</Button></>}>
        <form id="upload-document-form" className="form-stack" onSubmit={upload}>
          <Field label="Document" htmlFor="knowledge-file" error={fileError} hint="PDF or UTF-8 text, up to 10 MB."><Input ref={fileInput} id="knowledge-file" type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={chooseFile} required /></Field>
          {file ? <div className="selected-file"><Icon name="knowledge" /><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div></div> : null}
          <div className="inline-alert inline-alert--info">The API queues processing through SQS. Keep the document worker running to reach READY.</div>
        </form>
      </Modal>
      <Modal open={preview.open} onClose={closePreview} title={preview.document?.fileName || "Document preview"} description="Private preview from your organization’s knowledge storage." className="modal--preview" footer={<Button variant="secondary" onClick={closePreview}>Close preview</Button>}>
        <div className="document-preview">
          {preview.loading ? <div className="document-preview__loading" role="status"><Skeleton lines={6} /><span>Loading secure preview…</span></div> : null}
          {preview.error ? <ErrorState title="Preview unavailable" message={preview.error} onRetry={() => openPreview(preview.document)} /> : null}
          {!preview.loading && !preview.error && preview.text ? <pre className="document-preview__text" tabIndex="0">{preview.text}</pre> : null}
          {!preview.loading && !preview.error && preview.url ? <iframe className="document-preview__pdf" title={`Preview of ${preview.document.fileName}`} src={preview.url} /> : null}
        </div>
      </Modal>
    </div>
  );
}
