import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Loader2, Send, Sparkles, X } from "lucide-react";
import { api, getErrorMessage } from "../api/client";

/* ─── Suggested questions shown at the start ─── */
const SUGGESTIONS = [
  "What is my total approved expense amount?",
  "Show my pending expenses",
  "How much budget is remaining this month?",
  "List my recent certifications",
];

const ADMIN_SUGGESTIONS = [
  "How many expenses are pending approval?",
  "Which department has the highest spending?",
  "Show a summary of all budgets",
  "How many receipt reviews are pending?",
];

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lagoon/30 ring-1 ring-lagoon/40">
          <Bot size={14} className="text-cyan-300" />
        </div>
      )}

      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-tr-sm bg-lagoon text-white"
            : "rounded-tl-sm bg-white/10 text-white/90 ring-1 ring-white/10"
        }`}
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {msg.typing ? <TypingDots /> : msg.text}
      </div>
    </div>
  );
}

export default function ChatPanel({ isAdmin = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: `Hi! I'm your AI assistant. I can answer questions about your ${
        isAdmin ? "organisation's expenses, budgets, and approvals" : "expenses, budget, and certifications"
      }. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  /* Auto-scroll to latest message */
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  /* Focus input when panel opens */
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const suggestions = isAdmin ? ADMIN_SUGGESTIONS : SUGGESTIONS;

  async function sendMessage(text) {
    const userText = text.trim();
    if (!userText || loading) return;

    setInput("");
    const userMsg = { id: Date.now(), role: "user", text: userText };
    const typingMsg = { id: "typing", role: "assistant", typing: true };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setLoading(true);

    /* Build history (exclude welcome and typing placeholders) */
    const history = messages
      .filter((m) => m.id !== "welcome" && !m.typing)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));

    try {
      const res = await api.post("/chat", { message: userText, history });
      const aiMsg = { id: Date.now() + 1, role: "assistant", text: res.data.reply };
      setMessages((prev) => [...prev.filter((m) => m.id !== "typing"), aiMsg]);
      if (!open) setUnread((n) => n + 1);
    } catch (err) {
      const errMsg = {
        id: Date.now() + 1,
        role: "assistant",
        text: `Sorry, something went wrong: ${getErrorMessage(err)}`,
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== "typing"), errMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* ── Collapsed floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl shadow-cyan-900/40 transition hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #008c95, #6d28d9)",
          }}
          title="Open AI Assistant"
          aria-label="Open AI chat assistant"
        >
          <Sparkles size={24} className="text-white" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* ── Expanded chat panel ── */}
      {open && (
        <div
          className="fixed bottom-0 right-0 z-50 flex flex-col overflow-hidden shadow-2xl shadow-slate-900/60 sm:right-6"
          style={{
            width: "min(100vw, clamp(320px, 90vw, 420px))",
            height: "clamp(420px, 70vh, 620px)",
            borderRadius: "1rem 1rem 0 0",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(23, 32, 42, 0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{
              background: "linear-gradient(-45deg, #17202a, #008c95, #6d28d9)",
              backgroundSize: "300% 300%",
              animation: "gradientShift 10s ease infinite",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                <Bot size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Assistant</p>
                <p className="text-[10px] text-white/50">Powered by Gemini</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white"
              aria-label="Close chat"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin">
            {messages.map((msg) => (
              <Message key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions — shown only when there is just the welcome message */}
          {messages.length === 1 && (
            <div className="shrink-0 space-y-1.5 px-4 pb-2">
              <p className="text-[10px] uppercase tracking-widest text-white/30">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white/90"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div
            className="shrink-0 px-3 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-end gap-2 rounded-xl bg-white/8 ring-1 ring-white/10 px-3 py-2">
              <textarea
                ref={inputRef}
                className="flex-1 resize-none bg-transparent text-sm text-white placeholder-white/30 outline-none"
                rows={1}
                style={{ maxHeight: 80 }}
                placeholder="Ask anything about your data…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-40"
                style={{
                  background: input.trim() && !loading
                    ? "linear-gradient(135deg, #008c95, #6d28d9)"
                    : "rgba(255,255,255,0.08)",
                }}
                aria-label="Send message"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin text-white/60" />
                ) : (
                  <Send size={15} className="text-white" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-white/20">
              Answers based on your live dashboard data
            </p>
          </div>
        </div>
      )}
    </>
  );
}
