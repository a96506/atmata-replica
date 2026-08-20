"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { AiSuggestion } from "@/types";
import { sendAiChat } from "@/lib/actions/ai";

/**
 * AI Chat Panel — a conversational interface for natural-language ERP operations.
 *
 * Renders alongside the AiCopilotRail. Users can type commands like
 * "create a PO for 100 units of SKU-001 from Supplier X" and receive
 * structured action plans as AiSuggestion[].
 *
 * Messages are sent through the authenticated AI Server Action.
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: AiSuggestion[];
  timestamp: string;
};

export type AiChatPanelProps = {
  locale: string;
  /** Called when the user clicks "Do it" on a suggestion from chat. */
  onSuggestionAct?: (suggestion: AiSuggestion) => void;
};

export function AiChatPanel({ locale, onSuggestionAct }: AiChatPanelProps) {
  const t = useTranslations("ai.chat");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const result = await sendAiChat({
        message: text,
        context: { route: window.location.pathname },
        locale: locale === "ar" ? "ar" : "en",
      });
      if (result.ok) {
        const data = result.data;
        const assistantMsg: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: data.reply,
          suggestions: data.suggestions,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `error_${Date.now()}`,
          role: "assistant",
          content: t("failed"),
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: t("failed"),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          💬
        </span>
        <div className="text-sm font-semibold text-foreground">
          {t("title", { default: "AI Chat" })}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-xs text-muted-foreground">
              <div className="mb-2 text-lg">🤖</div>
              <div>{t("empty", { default: "Ask me anything about your ERP data" })}</div>
              <div className="mt-1 text-[10px]">
                {t("examples", {
                  default: 'Try: "Create a PO" or "Show overdue bills"',
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onSuggestionAct={onSuggestionAct}
              />
            ))}
            {isSending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:300ms]" />
                </div>
                <span>{t("thinking")}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder", {
              default: "Type a command or question...",
            })}
            disabled={isSending}
            className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("send", { default: "Send" })}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Chat bubble
 * ------------------------------------------------------------------ */

function ChatBubble({
  message: msg,
  onSuggestionAct,
}: {
  message: ChatMessage;
  onSuggestionAct?: (suggestion: AiSuggestion) => void;
}) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-muted/50 text-foreground"
        }`}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>

        {/* Inline suggestions */}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
            {msg.suggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border bg-card p-2 text-xs"
              >
                <div className="font-medium">{s.title}</div>
                <div className="mt-0.5 text-muted-foreground">{s.rationale}</div>
                {s.primaryAction && onSuggestionAct && (
                  <button
                    type="button"
                    onClick={() => onSuggestionAct(s)}
                    className="mt-1.5 cursor-pointer rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {s.primaryAction.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
