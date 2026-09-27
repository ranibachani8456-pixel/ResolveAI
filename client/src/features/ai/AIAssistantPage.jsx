import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { aiApi } from "../../api/aiApi.js";
import { useToast } from "../../hooks/useToast.js";
import { formatRelativeTime } from "../../utils/format.js";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input, Textarea } from "../../components/common/FormControls.jsx";
import Skeleton from "../../components/feedback/Skeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

const SELECTED_CONVERSATION_KEY = "resolveai.ai.selectedConversation";

const ConversationItem = memo(function ConversationItem({ conversation, active, onSelect }) {
  return (
    <button className={`conversation-item ${active ? "is-active" : ""}`} onClick={() => onSelect(conversation.id)}>
      <span className="conversation-item__icon"><Icon name="ai" size={16} /></span>
      <span><strong>{conversation.title || `Conversation #${conversation.id}`}</strong><small>Updated {formatRelativeTime(conversation.updatedAt)}</small></span>
      <Icon name="arrow" size={14} />
    </button>
  );
});

const AIMessage = memo(function AIMessage({ message, sources }) {
  const assistant = message.role === "ASSISTANT";
  return (
    <article className={`ai-message ai-message--${message.role.toLowerCase()}`}>
      <div className="ai-message__label"><span>{assistant ? <Icon name="ai" size={15} /> : "You"}</span><time>{formatRelativeTime(message.createdAt)}</time></div>
      <p>{message.content}</p>
      {assistant && sources?.length ? (
        <div className="ai-sources"><strong>Sources for this response</strong><ul>{sources.map((source) => <li key={`${source.documentId}:${source.chunkIndex}`}><Icon name="knowledge" size={14} /><span>{source.fileName}</span><small>Chunk {source.chunkIndex}</small></li>)}</ul></div>
      ) : null}
    </article>
  );
});

export default function AIAssistantPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [conversations, setConversations] = useState([]);
  const [listState, setListState] = useState({ loading: true, error: "" });
  const [conversationState, setConversationState] = useState({ loading: false, error: "", conversation: null });
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [latestSources, setLatestSources] = useState({});
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const messagesEnd = useRef(null);

  const loadConversations = useCallback(() => {
    const controller = new AbortController();
    setListState({ loading: true, error: "" });
    aiApi.listConversations(controller.signal).then((response) => {
      const items = response.data.conversations;
      setConversations(items);
      setListState({ loading: false, error: "" });
      if (!conversationId && items.length) {
        const saved = Number(window.sessionStorage.getItem(SELECTED_CONVERSATION_KEY));
        const selected = items.some(({ id }) => id === saved) ? saved : items[0].id;
        navigate(`/app/ai/${selected}`, { replace: true });
      }
    }).catch((error) => {
      if (error.name !== "AbortError") setListState({ loading: false, error: error.message });
    });
    return controller;
  }, [conversationId, navigate]);

  useEffect(() => { const controller = loadConversations(); return () => controller.abort(); }, [loadConversations]);

  useEffect(() => {
    setLatestSources({});
    if (!conversationId) {
      setConversationState({ loading: false, error: "", conversation: null });
      return undefined;
    }
    window.sessionStorage.setItem(SELECTED_CONVERSATION_KEY, conversationId);
    const controller = new AbortController();
    setConversationState({ loading: true, error: "", conversation: null });
    aiApi.getConversation(conversationId, controller.signal)
      .then((response) => setConversationState({ loading: false, error: "", conversation: response.data.conversation }))
      .catch((error) => {
        if (error.name !== "AbortError") setConversationState({ loading: false, error: error.message, conversation: null });
      });
    return () => controller.abort();
  }, [conversationId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversationState.conversation?.messages?.length]);

  const selectConversation = useCallback((id) => navigate(`/app/ai/${id}`), [navigate]);

  const createConversation = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true); setCreateError("");
    try {
      const response = await aiApi.createConversation(title.trim());
      const conversation = response.data.conversation;
      setConversations((current) => [conversation, ...current]);
      setCreateOpen(false); setTitle("");
      notify("AI conversation created.", "success");
      navigate(`/app/ai/${conversation.id}`);
    } catch (error) { setCreateError(error.message); } finally { setCreating(false); }
  };

  const send = async (event) => {
    event.preventDefault();
    if (sending || !question.trim() || !conversationId) return;
    const submittedQuestion = question.trim();
    setSending(true);
    try {
      const response = await aiApi.sendMessage(conversationId, submittedQuestion);
      const result = response.data;
      setConversationState((current) => ({
        ...current,
        conversation: {
          ...current.conversation,
          messages: [...current.conversation.messages, result.userMessage, result.assistantMessage],
          updatedAt: result.assistantMessage.createdAt,
        },
      }));
      setLatestSources({ [result.assistantMessage.id]: result.sources });
      setQuestion("");
      setConversations((current) => current
        .map((item) => item.id === Number(conversationId) ? { ...item, updatedAt: result.assistantMessage.createdAt } : item)
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt)));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ai-workspace">
      <aside className="ai-conversations" aria-label="AI conversations">
        <div className="ai-conversations__header"><div><p className="page-header__eyebrow">Knowledge workspace</p><h1>AI Assistant</h1></div><Button size="small" icon="plus" onClick={() => setCreateOpen(true)}>New</Button></div>
        <p className="ai-conversations__intro">Grounded answers from READY documents in your organization.</p>
        <div className="conversation-list">
          {listState.loading ? <><Skeleton lines={2} /><Skeleton lines={2} /><Skeleton lines={2} /></> : listState.error ? <ErrorState message={listState.error} onRetry={loadConversations} /> : conversations.length ? conversations.map((conversation) => <ConversationItem key={conversation.id} conversation={conversation} active={String(conversation.id) === conversationId} onSelect={selectConversation} />) : <EmptyState title="No conversations" description="Create a focused workspace for a support question." action={<Button size="small" icon="plus" onClick={() => setCreateOpen(true)}>New conversation</Button>} />}
        </div>
      </aside>

      <section className="ai-chat">
        {conversationState.loading ? <div className="ai-history-skeleton"><Skeleton lines={2} /><Skeleton lines={3} /><Skeleton lines={2} /></div> : conversationState.error ? <ErrorState title="Unable to open conversation" message={conversationState.error} /> : conversationState.conversation ? (
          <>
            <header className="ai-chat__header"><div><h2>{conversationState.conversation.title || `Conversation #${conversationState.conversation.id}`}</h2><p>Private to you within this organization · grounded retrieval runs for every question</p></div><span className="ai-ready"><span className="status-dot" />Knowledge connected</span></header>
            <div className="ai-history">
              {conversationState.conversation.messages.length ? conversationState.conversation.messages.map((message) => <AIMessage message={message} sources={latestSources[message.id]} key={message.id} />) : <div className="ai-empty"><span><Icon name="ai" size={22} /></span><h3>Ask your knowledge base</h3><p>Use this conversation for related support questions. Answers stay grounded in READY documents.</p><div><button onClick={() => setQuestion("Summarize our refund policy.")}>Summarize our refund policy</button><button onClick={() => setQuestion("What information should a customer provide?")}>What should a customer provide?</button></div></div>}
              {sending ? <div className="ai-thinking"><span className="button__spinner" /><p>Retrieving trusted sources and preparing an answer…</p></div> : null}
              <div ref={messagesEnd} />
            </div>
            <form className="ai-composer" onSubmit={send}><label htmlFor="ai-question">Ask a follow-up question</label><div><Textarea id="ai-question" rows="2" maxLength="2000" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder="Ask about a policy, requirement, or support procedure…" disabled={sending} /><Button type="submit" icon="send" loading={sending} disabled={!question.trim()} aria-label="Send question">Send</Button></div><span>{question.length}/2000 · Enter to send, Shift+Enter for a new line</span></form>
          </>
        ) : <div className="ai-no-selection"><Icon name="ai" size={26} /><h2>Select a conversation</h2><p>Choose an existing conversation or create a new one to begin.</p><Button icon="plus" onClick={() => setCreateOpen(true)}>New conversation</Button></div>}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New AI conversation" description="Use a concise title so this workspace is easy to find later." footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="create-ai-conversation" loading={creating}>Create conversation</Button></>}><form id="create-ai-conversation" className="form-stack" onSubmit={createConversation}>{createError ? <div className="inline-alert inline-alert--error" role="alert">{createError}</div> : null}<Field label="Title" htmlFor="conversation-title" hint="Optional, up to 191 characters."><Input id="conversation-title" maxLength="191" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Refund policy questions" /></Field></form></Modal>
    </div>
  );
}
