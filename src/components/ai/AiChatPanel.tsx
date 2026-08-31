"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { AiSuggestion } from "@/types";

/**
 * AI Chat Panel — conversational ERP assistant with streamed replies.
 * Posts to `/api/ai` (SSE) so tokens render as they arrive.
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

type SsePayload =
  | { type: "token"; text: string }
  | { type: "done"; suggestions?: AiSuggestion[] }
  | { type: "error"; code?: string; requestId?: string };

async function streamAiChat(input: {
  message: string;
  locale: "en" | "ar";
  route?: string;
  onToken: (text: string) => void;
}): Promise<{ suggestions: AiSuggestion[] }> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      operation: "chat",
      message: input.message,
      locale: input.locale,
      context: input.route ? { route: input.route } : undefined,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`chat_failed_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let suggestions: AiSuggestion[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      let payload: SsePayload;
      try {
        payload = JSON.parse(json) as SsePayload;
      } catch {
        continue;
      }
      if (payload.type === "token" && payload.text) {
        input.onToken(payload.text);
      } else if (payload.type === "done") {
        suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
      } else if (payload.type === "error") {
        throw new Error(payload.code ?? "MODEL_FAILED");
      }
    }
  }

  return { suggestions };
}

export function AiChatPanel({ locale, onSuggestionAct }: AiChatPanelProps) {
  const t = useTranslations("ai.chat");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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
    const assistantId = `assistant_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      },
    ]);
    setInput("");
    setIsSending(true);

    try {
      const { suggestions } = await streamAiChat({
        message: text,
        locale: locale === "ar" ? "ar" : "en",
        route: window.location.pathname,
        onToken: (token) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + token }
                : msg,
            ),
          );
        },
      });
      if (suggestions.length > 0) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, suggestions } : msg,
          ),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: msg.content || t("failed") }
            : msg,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
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
            onClick={() => void sendMessage()}
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
        <div className="whitespace-pre-wrap">
          {msg.content || (msg.role === "assistant" ? "…" : "")}
        </div>

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
