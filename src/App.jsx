import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "https://rag-chatbot-production-ecb6.up.railway.app";

function makeChatId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function App() {
  const [chats, setChats] = useState(() => {
    const id = makeChatId();
    return [{ id, title: "New Chat", messages: [], createdAt: Date.now(), archived: false }];
  });
  const [activeChatId, setActiveChatId] = useState(chats[0].id);
  const [showArchived, setShowArchived] = useState(false);

  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("dark");

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");

  const chatBoxRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const visibleChats = chats.filter((c) => !c.archived);
  const archivedChats = chats.filter((c) => c.archived);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [activeChat?.messages, loading]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const fetchDocuments = async () => {
    setDocsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/documents`);
      const data = await response.json();
      if (response.ok) setDocuments(data.documents || []);
    } catch {
      // silent
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const updateActiveChatMessages = (updater) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId ? { ...chat, messages: updater(chat.messages) } : chat
      )
    );
  };

  const setChatTitleFromFirstMessage = (text) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId && chat.title === "New Chat"
          ? { ...chat, title: text.slice(0, 40) + (text.length > 40 ? "…" : "") }
          : chat
      )
    );
  };

  const startNewChat = () => {
    const id = makeChatId();
    setChats((prev) => [
      { id, title: "New Chat", messages: [], createdAt: Date.now(), archived: false },
      ...prev,
    ]);
    setActiveChatId(id);
    setQuestion("");
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const clearActiveChat = () => {
    updateActiveChatMessages(() => []);
  };

  const pickNextActiveChat = (remainingChats) => {
    const firstVisible = remainingChats.find((c) => !c.archived);
    if (firstVisible) {
      setActiveChatId(firstVisible.id);
    } else {
      const id = makeChatId();
      const newChat = { id, title: "New Chat", messages: [], createdAt: Date.now(), archived: false };
      setChats([newChat, ...remainingChats]);
      setActiveChatId(id);
    }
  };

  const deleteChat = (id, event) => {
    event.stopPropagation();
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;

    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeChatId) {
        pickNextActiveChat(remaining);
      }
      return remaining;
    });
  };

  const archiveChat = (id, event) => {
    event.stopPropagation();

    setChats((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, archived: true } : c));
      if (id === activeChatId) {
        pickNextActiveChat(updated);
      }
      return updated;
    });
  };

  const unarchiveChat = (id, event) => {
    event.stopPropagation();
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, archived: false } : c)));
  };

  const handleFiles = async (fileList) => {
    const file = fileList[0];
    if (!file) return;

    const allowedExtensions = [".pdf", ".txt", ".md", ".docx"];
    const fileName = file.name.toLowerCase();
    const isAllowed = allowedExtensions.some((ext) => fileName.endsWith(ext));

    if (!isAllowed) {
      alert("Please upload a PDF, TXT, Markdown (.md), or Word (.docx) file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || "Upload failed.");

      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          role: "bot",
          text: `✅ ${file.name} uploaded successfully.\n\n${data.total_chunks} chunks were processed and stored in the knowledge base.`,
          sources: [],
          time: timeNow(),
        },
      ]);

      fetchDocuments();
    } catch (error) {
      updateActiveChatMessages((msgs) => [
        ...msgs,
        { role: "bot", text: `❌ Upload failed: ${error.message}`, sources: [], time: timeNow() },
      ]);
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer.files);
  };

  const uploadUrl = async () => {
    const url = urlValue.trim();
    if (!url) return;

    let isValidUrl = true;
    try {
      new URL(url);
    } catch {
      isValidUrl = false;
    }

    if (!isValidUrl) {
      alert("Please enter a valid URL (e.g. https://example.com).");
      return;
    }

    setUploading(true);
    setShowUrlInput(false);

    try {
      const response = await fetch(`${API_BASE}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch URL.");

      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          role: "bot",
          text: `✅ Website page fetched successfully.\n\n${data.total_chunks} chunks were processed and stored in the knowledge base.`,
          sources: [],
          time: timeNow(),
        },
      ]);

      fetchDocuments();
    } catch (error) {
      updateActiveChatMessages((msgs) => [
        ...msgs,
        { role: "bot", text: `❌ Failed to fetch URL: ${error.message}`, sources: [], time: timeNow() },
      ]);
    } finally {
      setUploading(false);
      setUrlValue("");
    }
  };

  const handleUrlKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      uploadUrl();
    } else if (event.key === "Escape") {
      setShowUrlInput(false);
      setUrlValue("");
    }
  };

  const deleteDocument = async (name) => {
    if (!window.confirm(`Delete "${name}" from the knowledge base?`)) return;
    try {
      const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete.");
      }
      fetchDocuments();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const sendMessage = async () => {
    if (!question.trim() || loading || uploading) return;

    const userQuestion = question.trim();

    const conversationHistory = activeChat.messages
      .filter((m) => m.role === "user" || m.role === "bot")
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));

    setChatTitleFromFirstMessage(userQuestion);

    updateActiveChatMessages((msgs) => [
      ...msgs,
      { role: "user", text: userQuestion, sources: [], time: timeNow() },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuestion, history: conversationHistory }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Something went wrong.");

      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          role: "bot",
          text: data.answer || "I couldn't find an answer.",
          sources: data.sources || [],
          time: timeNow(),
        },
      ]);
    } catch (error) {
      updateActiveChatMessages((msgs) => [
        ...msgs,
        { role: "bot", text: `❌ ${error.message}`, sources: [], time: timeNow() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="shell">

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>

        <div className="sidebar-brand">
          <div className="logo">✦</div>
          <span className="brand-name">Lumis</span>
        </div>

        <button className="new-chat-btn" onClick={startNewChat}>
          + New Chat
        </button>

        <div className="sidebar-section-label">Chats</div>

        <div className="chat-list">
          {visibleChats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-list-item ${chat.id === activeChatId ? "active" : ""}`}
              onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false); }}
            >
              <span className="chat-list-icon">💬</span>
              <span className="chat-list-title">{chat.title}</span>
              <span className="chat-list-time">
                {new Date(chat.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="chat-list-actions">
                <button
                  className="chat-action-btn"
                  onClick={(e) => archiveChat(chat.id, e)}
                  title="Archive chat"
                >
                  📥
                </button>
                <button
                  className="chat-action-btn danger"
                  onClick={(e) => deleteChat(chat.id, e)}
                  title="Delete chat"
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>

        {archivedChats.length > 0 && (
          <>
            <button
              className="archived-toggle"
              onClick={() => setShowArchived((prev) => !prev)}
            >
              {showArchived ? "▾" : "▸"} Archived ({archivedChats.length})
            </button>

            {showArchived && (
              <div className="chat-list archived-list">
                {archivedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-list-item archived ${chat.id === activeChatId ? "active" : ""}`}
                    onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false); }}
                  >
                    <span className="chat-list-icon">💬</span>
                    <span className="chat-list-title">{chat.title}</span>
                    <span className="chat-list-actions">
                      <button
                        className="chat-action-btn"
                        onClick={(e) => unarchiveChat(chat.id, e)}
                        title="Unarchive"
                      >
                        📤
                      </button>
                      <button
                        className="chat-action-btn danger"
                        onClick={(e) => deleteChat(chat.id, e)}
                        title="Delete chat"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="sidebar-bottom">

          <div className="kb-label">Your Knowledge Base</div>

          <label
            htmlFor="file-input"
            className={`dropzone ${dragActive ? "drag-active" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <div className="dropzone-icon">☁️</div>
            <p className="dropzone-title">Drag & drop files here</p>
            <p className="dropzone-sub">PDF, DOCX, TXT, MD</p>
            <span className="browse-btn">Browse Files</span>
          </label>
          <input
            id="file-input"
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,.txt,text/plain,.md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileInputChange}
            disabled={uploading}
            style={{ display: "none" }}
          />

          <div className="uploaded-header">
            <span>Uploaded Documents</span>
            <span className="uploaded-count">{documents.length}</span>
          </div>

          <div className="uploaded-list">
            {docsLoading && documents.length === 0 && (
              <p className="uploaded-empty">Loading…</p>
            )}
            {!docsLoading && documents.length === 0 && (
              <p className="uploaded-empty">No documents yet.</p>
            )}
            {documents.map((doc) => (
              <div className="uploaded-item" key={doc.name}>
                <span className="uploaded-icon">📄</span>
                <span className="uploaded-name">{doc.name}</span>
                <span className="uploaded-check">✓</span>
                <button
                  className="uploaded-delete"
                  onClick={() => deleteDocument(doc.name)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

        </div>

      </aside>

      <main className="main">

        <header className="main-header">
          <div className="main-header-left">
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <span className="status-dot" />
            <div>
              <h2>Lumis</h2>
              <p>Ask me anything about your documents</p>
            </div>
          </div>
          <div className="main-header-right">
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "☾ Dark Mode" : "☀ Light Mode"}
            </button>
            <button className="clear-chat-btn" onClick={clearActiveChat}>
              🗑 Clear Chat
            </button>
          </div>
        </header>

        <div className="chat-box" ref={chatBoxRef}>

          {activeChat.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✦</div>
              <h2>Hi, I'm Lumis</h2>
              <p>Upload a document or add a website link, then ask questions about its contents.</p>
            </div>
          ) : (
            activeChat.messages.map((message, index) => (
              <div key={index} className={`message-row ${message.role}`}>

                {message.role === "bot" && <div className="avatar bot-avatar">✦</div>}

                <div className="message-col">
                  <div className={`bubble ${message.role}`}>
                    <div className="bubble-text">{message.text}</div>

                    {message.sources && message.sources.length > 0 && (
                      <>
                        <div className="bubble-divider" />
                        <div className="bubble-sources-label">Sources:</div>
                        <div className="source-chips">
                          {[
                            ...new Map(
                              message.sources.map((s) => [`${s.source}-${s.page_number}`, s])
                            ).values(),
                          ].map((source, i) => (
                            <span className="source-chip" key={i}>
                              <span className="source-chip-num">{i + 1}</span>
                              {source.source}
                              {source.page_number && source.page_number !== "Unknown"
                                ? ` (Page ${source.page_number})`
                                : ""}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <span className="bubble-time">{message.time}</span>
                </div>

                {message.role === "user" && <div className="avatar user-avatar">🙂</div>}

              </div>
            ))
          )}

          {loading && (
            <div className="message-row bot">
              <div className="avatar bot-avatar">✦</div>
              <div className="message-col">
                <div className="bubble bot thinking">
                  <span>Thinking</span>
                  <span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="input-bar">
          <div className="input-bar-inner">
            <label htmlFor="file-input-inline" className="attach-btn" title="Attach a file">
              📎
            </label>
            <input
              id="file-input-inline"
              type="file"
              accept=".pdf,application/pdf,.txt,text/plain,.md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFileInputChange}
              disabled={uploading}
              style={{ display: "none" }}
            />

            <div className="url-btn-wrapper">
              <button
                type="button"
                className="attach-btn"
                title="Add a website link"
                onClick={() => setShowUrlInput((prev) => !prev)}
                disabled={uploading || loading}
              >
                🌐
              </button>

              {showUrlInput && (
                <div className="url-popover">
                  <p className="url-popover-label">Paste a website URL</p>
                  <input
                    type="text"
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    onKeyDown={handleUrlKeyDown}
                    placeholder="https://example.com/article"
                    autoFocus
                    disabled={uploading}
                  />
                  <div className="url-popover-actions">
                    <button
                      type="button"
                      className="url-popover-cancel"
                      onClick={() => { setShowUrlInput(false); setUrlValue(""); }}
                      disabled={uploading}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="url-popover-add"
                      onClick={uploadUrl}
                      disabled={uploading || !urlValue.trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={uploading ? "Processing…" : "Ask a question about your documents..."}
              disabled={loading || uploading}
            />
            <button className="send-btn" onClick={sendMessage} disabled={loading || uploading || !question.trim()}>
              ➤
            </button>
          </div>
          <p className="input-disclaimer">
            <span>Answers are generated based on your documents. Please verify important information.</span>
            <span className="powered-by">Powered by RAG + LLM</span>
          </p>
        </div>

      </main>

    </div>
  );
}

export default App;