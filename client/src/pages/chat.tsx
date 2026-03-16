import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import type { Message } from "@shared/schema";

export default function Chat() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    queryFn: () => apiRequest("GET", "/api/messages").then(r => r.json()),
    refetchInterval: 2000,
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/messages", {
        role: "user",
        content,
        providerId: null,
        model: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setInput("");
    },
  });

  const clearMessages = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/messages"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage.mutate(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]" data-testid="chat-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">AI Chat</h2>
          <p className="text-xs text-muted-foreground">
            Chat met de beste beschikbare gratis AI. Automatische provider selectie.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearMessages.mutate()}
          className="text-muted-foreground hover:text-destructive"
          data-testid="button-clear-chat"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Wissen
        </Button>
      </div>

      {/* Messages */}
      <Card className="flex-1 border-border/50 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">FreeAI Orchestrator</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Stel een vraag, geef een opdracht, of laat de AI een complexe taak plannen.
                  Meerdere gratis AI-services worden automatisch gecombineerd.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {["Wat kun je allemaal?", "Scrape de voorpagina van HN", "Plan een registratie-flow"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="px-3 py-1.5 text-xs rounded-full border border-border/50 hover:bg-muted/50 transition-colors"
                    data-testid={`suggestion-${q.substring(0, 10)}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              {msg.role !== "user" && (
                <div className="shrink-0 p-1.5 rounded-lg bg-primary/10 h-fit">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.model && (
                  <Badge variant="secondary" className="mt-2 text-[10px]">
                    {msg.model}
                  </Badge>
                )}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 p-1.5 rounded-lg bg-muted/50 h-fit">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {sendMessage.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="shrink-0 p-1.5 rounded-lg bg-primary/10 h-fit">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="rounded-xl px-4 py-3 bg-muted/50">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht... (Enter om te verzenden)"
          className="resize-none min-h-[44px] max-h-[120px] text-sm"
          rows={1}
          data-testid="input-chat"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          size="icon"
          className="shrink-0 h-[44px] w-[44px]"
          data-testid="button-send"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
