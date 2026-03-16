/**
 * AI Engine — Real API calls to free LLM providers
 * Supports OpenAI-compatible APIs (Groq, OpenRouter, SiliconFlow, GitHub Models, Cloudflare)
 * and Google Gemini native API
 */

import type { Provider } from "@shared/schema";
import { chatDuckDuckGo, chatPollinations } from "./auto-provision";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  providerId: string;
  providerName: string;
  tokensUsed?: number;
  latencyMs: number;
}

/**
 * Call an OpenAI-compatible chat API (Groq, OpenRouter, SiliconFlow, GitHub, Cloudflare, HuggingFace)
 */
async function callOpenAICompatible(
  provider: Provider,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Different auth headers per provider
  if (provider.apiKey) {
    if (provider.endpoint.includes("huggingface")) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    } else if (provider.endpoint.includes("cloudflare")) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    } else {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
  }

  // OpenRouter needs extra headers
  if (provider.endpoint.includes("openrouter")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:5000";
    headers["X-Title"] = "FreeAI Orchestrator";
  }

  const body: any = {
    model: provider.model,
    messages,
    max_tokens: 2048,
    temperature: 0.7,
  };

  // HuggingFace uses different format
  if (provider.endpoint.includes("huggingface") && !provider.endpoint.includes("/v1/")) {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: messages.map(m => `${m.role}: ${m.content}`).join("\n"),
        parameters: { max_new_tokens: 2048, temperature: 0.7 },
      }),
      signal,
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HuggingFace API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data[0]?.generated_text || "" : data.generated_text || "";
  }

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Call Google Gemini API
 */
async function callGemini(
  provider: Provider,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const url = `${provider.endpoint}?key=${provider.apiKey}`;

  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === "system");

  const body: any = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Call Ollama local API
 */
async function callOllama(
  provider: Provider,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.message?.content || "";
}

/**
 * Main chat function — routes to correct provider
 */
export async function chat(
  provider: Provider,
  messages: ChatMessage[],
  timeoutMs = 30000
): Promise<ChatResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let content: string;

    // Key-vrije providers (Pollinations, DuckDuckGo)
    if (provider.endpoint.startsWith("internal://pollinations")) {
      // Haal het Pollinations model uit de config
      let polModel = "openai";
      if (provider.config) {
        try {
          const cfg = JSON.parse(provider.config);
          polModel = cfg.pollinationsModel || "openai";
        } catch {}
      }
      const polResult = await chatPollinations(messages, polModel);
      content = polResult.content;
    } else if (provider.endpoint.startsWith("internal://duckduckgo")) {
      const ddgResult = await chatDuckDuckGo(messages, provider.model || "gpt-4o-mini");
      content = ddgResult.content;
    } else if (provider.endpoint.includes("generativelanguage.googleapis.com")) {
      content = await callGemini(provider, messages, controller.signal);
    } else if (provider.endpoint.includes("localhost:11434") || provider.endpoint.includes("ollama")) {
      content = await callOllama(provider, messages, controller.signal);
    } else {
      content = await callOpenAICompatible(provider, messages, controller.signal);
    }

    return {
      content,
      model: provider.model || "unknown",
      providerId: provider.id,
      providerName: provider.name,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try multiple providers in order until one succeeds (failover)
 */
export async function chatWithFailover(
  providers: Provider[],
  messages: ChatMessage[],
  timeoutMs = 30000
): Promise<ChatResponse> {
  const errors: string[] = [];

  // Sort: online first, then by latency
  const sorted = [...providers].sort((a, b) => {
    if (a.status === "online" && b.status !== "online") return -1;
    if (b.status === "online" && a.status !== "online") return 1;
    return (a.latencyMs || 9999) - (b.latencyMs || 9999);
  });

  // Filter out providers without API keys (if required)
  const ready = sorted.filter(p => !p.apiKeyRequired || (p.apiKey && p.apiKey.length > 0));

  if (ready.length === 0) {
    throw new Error("Geen providers beschikbaar met API key. Configureer minstens één provider op de Providers pagina.");
  }

  for (const provider of ready) {
    try {
      return await chat(provider, messages, timeoutMs);
    } catch (err: any) {
      errors.push(`${provider.name}: ${err.message}`);
      continue;
    }
  }

  throw new Error(`Alle providers gefaald:\n${errors.join("\n")}`);
}
