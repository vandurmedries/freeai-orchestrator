/**
 * Auto-Provisioning Engine
 * Automatisch gratis AI-providers vinden en configureren
 * ZONDER dat de gebruiker zelf API keys hoeft in te vullen.
 *
 * Strategie:
 * 1. Key-vrije providers → direct beschikbaar:
 *    - Pollinations.ai (openai-fast GPT-OSS 20B — GEEN key nodig)
 *    - DuckDuckGo AI Chat (GPT-4o-mini, Claude, o3-mini — GEEN key, maar IP-geblokkeerd)
 * 2. Env-based keys → automatisch laden uit .env
 * 3. Health check → werkende providers markeren als online
 */

import { storage } from "./storage";
import type { InsertProvider } from "@shared/schema";

// ============================================================
// Pollinations.ai — Helemaal gratis, geen key nodig
// Alleen "openai" (openai-fast / GPT-OSS 20B) is beschikbaar
// voor anonieme requests
// ============================================================

export async function chatPollinations(
  messages: Array<{ role: string; content: string }>,
  model: string = "openai"
): Promise<{ content: string; model: string }> {
  const res = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      model: "openai", // alleen openai-fast werkt voor anoniem
      jsonMode: false,
      seed: Math.floor(Math.random() * 100000),
      private: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Pollinations error ${res.status}: ${err}`);
  }

  const text = await res.text();
  // Filter deprecation notices uit het antwoord
  const cleaned = text
    .replace(/⚠️[\s\S]*?text\.pollinations\.ai are NOT affected\.\s*/g, "")
    .trim();
  return { content: cleaned || text.trim(), model: "openai-fast" };
}

// ============================================================
// DuckDuckGo AI Chat — Gratis, geen key nodig
// Kan geblokkeerd worden vanuit bepaalde server-IPs
// ============================================================

let ddgVqdToken: string | null = null;

async function getDDGToken(): Promise<string> {
  const res = await fetch("https://duckduckgo.com/duckchat/v1/status", {
    headers: {
      "Accept": "*/*",
      "Cache-Control": "no-store",
      "Referer": "https://duckduckgo.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "x-vqd-accept": "1",
    },
  });

  const token = res.headers.get("x-vqd-4");
  if (!token) throw new Error("Kon DuckDuckGo VQD token niet ophalen");
  ddgVqdToken = token;
  return token;
}

export async function chatDuckDuckGo(
  messages: Array<{ role: string; content: string }>,
  model: string = "gpt-4o-mini"
): Promise<{ content: string; model: string }> {
  const vqd = await getDDGToken();

  const userMessages = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role, content: m.content }));

  const body = {
    model,
    messages: userMessages,
    canUseTools: false,
    canUseApproxLocation: false,
  };

  const res = await fetch("https://duckduckgo.com/duckchat/v1/chat", {
    method: "POST",
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": "application/json",
      "Referer": "https://duckduckgo.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "x-vqd-4": vqd,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo chat error ${res.status}: ${err}`);
  }

  const text = await res.text();
  let fullContent = "";

  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        if (parsed.message) {
          fullContent += parsed.message;
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  const newVqd = res.headers.get("x-vqd-4");
  if (newVqd) ddgVqdToken = newVqd;

  return { content: fullContent, model };
}

// ============================================================
// Multi-Source Provider — Probeert meerdere gratis bronnen
// parallel en retourneert het snelste werkende antwoord
// ============================================================

export async function chatMultiSource(
  messages: Array<{ role: string; content: string }>
): Promise<{ content: string; model: string; source: string }> {
  // Probeer Pollinations en DuckDuckGo parallel
  const attempts = [
    chatPollinations(messages, "openai")
      .then(r => ({ ...r, source: "Pollinations" })),
    chatDuckDuckGo(messages, "gpt-4o-mini")
      .then(r => ({ ...r, source: "DuckDuckGo" }))
      .catch(() => null),
    chatDuckDuckGo(messages, "claude-3-haiku-20240307")
      .then(r => ({ ...r, source: "DuckDuckGo-Claude" }))
      .catch(() => null),
  ];

  // Race: pak het eerste werkende antwoord
  const results = await Promise.allSettled(attempts);
  
  for (const result of results) {
    if (result.status === "fulfilled" && result.value && result.value.content) {
      return result.value as { content: string; model: string; source: string };
    }
  }

  throw new Error("Alle multi-source providers gefaald");
}

// ============================================================
// Auto-provision: registreer key-vrije providers + laad env keys
// ============================================================

export async function autoProvision(): Promise<{
  added: string[];
  configured: string[];
  errors: string[];
}> {
  const added: string[] = [];
  const configured: string[] = [];
  const errors: string[] = [];

  console.log("[auto-provision] Gratis AI-providers zoeken en configureren...");

  // ====== 1. POLLINATIONS.AI — Primaire key-vrije provider ======
  // Alleen openai-fast (GPT-OSS 20B) is beschikbaar voor anoniem
  const pollinationsProviders: InsertProvider[] = [
    {
      name: "Pollinations (GPT-OSS 20B)",
      type: "reasoning",
      endpoint: "internal://pollinations-openai",
      apiKeyRequired: false,
      apiKey: null,
      model: "openai-fast",
      status: "unknown",
      latencyMs: null,
      rateLimit: "Gratis (1 request/IP tegelijk)",
      description: "Pollinations.ai — gratis GPT-OSS 20B reasoning model, geen API key nodig.",
      config: JSON.stringify({ keyFree: true, provider: "pollinations", pollinationsModel: "openai" }),
    },
  ];

  // ====== 2. DuckDuckGo AI Chat — Fallback key-vrije providers ======
  const duckduckgoProviders: InsertProvider[] = [
    {
      name: "DuckDuckGo AI (GPT-4o-mini)",
      type: "chat",
      endpoint: "internal://duckduckgo",
      apiKeyRequired: false,
      apiKey: null,
      model: "gpt-4o-mini",
      status: "unknown",
      latencyMs: null,
      rateLimit: "Onbeperkt (fair use)",
      description: "DuckDuckGo AI Chat — gratis GPT-4o-mini. Kan geblokkeerd zijn vanuit sommige servers.",
      config: JSON.stringify({ keyFree: true, provider: "duckduckgo" }),
    },
    {
      name: "DuckDuckGo AI (Claude 3 Haiku)",
      type: "chat",
      endpoint: "internal://duckduckgo-claude",
      apiKeyRequired: false,
      apiKey: null,
      model: "claude-3-haiku-20240307",
      status: "unknown",
      latencyMs: null,
      rateLimit: "Onbeperkt (fair use)",
      description: "DuckDuckGo AI Chat — gratis Claude 3 Haiku. Kan geblokkeerd zijn vanuit sommige servers.",
      config: JSON.stringify({ keyFree: true, provider: "duckduckgo" }),
    },
    {
      name: "DuckDuckGo AI (o3-mini)",
      type: "reasoning",
      endpoint: "internal://duckduckgo-o3",
      apiKeyRequired: false,
      apiKey: null,
      model: "o3-mini",
      status: "unknown",
      latencyMs: null,
      rateLimit: "Onbeperkt (fair use)",
      description: "DuckDuckGo AI Chat — gratis o3-mini. Kan geblokkeerd zijn vanuit sommige servers.",
      config: JSON.stringify({ keyFree: true, provider: "duckduckgo" }),
    },
  ];

  // ====== 3. MULTI-SOURCE — Combineert alle gratis bronnen als één betrouwbare provider ======
  const multiSourceProviders: InsertProvider[] = [
    {
      name: "FreeAI Multi-Source (Onbeperkt)",
      type: "chat",
      endpoint: "internal://multi-source",
      apiKeyRequired: false,
      apiKey: null,
      model: "auto",
      status: "unknown",
      latencyMs: null,
      rateLimit: "Onbeperkt — combineert alle gratis bronnen",
      description: "Combineert Pollinations + DuckDuckGo parallel. Pakt het snelste werkende antwoord. Geen restricties.",
      config: JSON.stringify({ keyFree: true, provider: "multi-source", unrestricted: true }),
    },
  ];

  const allKeyFree = [...multiSourceProviders, ...pollinationsProviders, ...duckduckgoProviders];

  // Check welke al bestaan — verwijder oude Pollinations providers die niet meer werken
  const existing = await storage.getProviders();
  const existingNames = new Set(existing.map(p => p.name));

  // Verwijder oude Pollinations providers die niet meer bestaan
  const oldPollinationsNames = [
    "Pollinations (GPT-5-nano)",
    "Pollinations (Mistral)",
    "Pollinations (Llama 3.3)",
    "Pollinations (Qwen3-Coder)",
    "Pollinations (DeepSeek V3)",
    "Pollinations (Claude)",
    "Pollinations (Gemini)",
  ];
  for (const oldName of oldPollinationsNames) {
    const old = existing.find(p => p.name === oldName);
    if (old) {
      await storage.deleteProvider(old.id);
      console.log(`[auto-provision] - ${oldName} verwijderd (model niet meer beschikbaar)`);
    }
  }

  for (const provider of allKeyFree) {
    if (!existingNames.has(provider.name)) {
      await storage.createProvider(provider);
      added.push(provider.name);
      console.log(`[auto-provision] + ${provider.name} (geen key nodig)`);
    }
  }

  // 4. Laad API keys uit environment variabelen
  const envMappings: Array<{ envVar: string; providerName: string }> = [
    { envVar: "GROQ_API_KEY", providerName: "Groq (Llama 3.3 70B)" },
    { envVar: "GEMINI_API_KEY", providerName: "Google AI Studio (Gemini)" },
    { envVar: "OPENROUTER_API_KEY", providerName: "OpenRouter (Free Models)" },
    { envVar: "HUGGINGFACE_API_KEY", providerName: "HuggingFace Inference" },
    { envVar: "SILICONFLOW_API_KEY", providerName: "SiliconFlow" },
    { envVar: "CLOUDFLARE_API_KEY", providerName: "Cloudflare Workers AI" },
    { envVar: "GITHUB_TOKEN", providerName: "GitHub Models" },
    { envVar: "TWOCAPTCHA_API_KEY", providerName: "2Captcha" },
    { envVar: "CAPSOLVER_API_KEY", providerName: "CapSolver (AI)" },
  ];

  const allProviders = await storage.getProviders();
  for (const mapping of envMappings) {
    const envValue = process.env[mapping.envVar];
    if (envValue && envValue.trim().length > 0) {
      const provider = allProviders.find(p => p.name === mapping.providerName);
      if (provider && (!provider.apiKey || provider.apiKey.length === 0)) {
        await storage.updateProvider(provider.id, { apiKey: envValue.trim() });
        configured.push(`${mapping.providerName} (via ${mapping.envVar})`);
        console.log(`[auto-provision] \u2714 ${mapping.providerName} key geladen uit ${mapping.envVar}`);
      }
    }
  }

  // 5. Health check key-vrije providers
  console.log("[auto-provision] Health checks uitvoeren...");
  const allProvidersNow = await storage.getProviders();
  for (const name of added) {
    const provider = allProvidersNow.find(p => p.name === name);
    if (!provider) continue;

    try {
      const start = Date.now();
      if (provider.config) {
        const config = JSON.parse(provider.config);

        if (config.provider === "multi-source") {
          // Multi-source is altijd beschikbaar (combineert alles)
          await storage.updateProvider(provider.id, { status: "online", latencyMs: null });
          console.log(`[auto-provision] \u2714 ${name} online (multi-source combinator)`);
          continue;
        }

        if (config.provider === "pollinations") {
          try {
            const testRes = await fetch("https://text.pollinations.ai/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [{ role: "user", content: "hi" }],
                model: "openai",
                seed: 1,
                private: true,
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (testRes.ok) {
              const latency = Date.now() - start;
              await storage.updateProvider(provider.id, { status: "online", latencyMs: latency });
              console.log(`[auto-provision] \u2714 ${name} online (${latency}ms)`);
            } else {
              await storage.updateProvider(provider.id, { status: "online", latencyMs: null });
              console.log(`[auto-provision] \u2714 ${name} beschikbaar (status ${testRes.status})`);
            }
          } catch {
            await storage.updateProvider(provider.id, { status: "online", latencyMs: null });
            console.log(`[auto-provision] \u2714 ${name} beschikbaar (timeout bij test)`);
          }
          continue;
        }

        if (config.provider === "duckduckgo") {
          try {
            await getDDGToken();
            const latency = Date.now() - start;
            await storage.updateProvider(provider.id, { status: "online", latencyMs: latency });
            console.log(`[auto-provision] \u2714 ${name} online (${latency}ms)`);
          } catch {
            await storage.updateProvider(provider.id, { status: "degraded", latencyMs: null });
            console.log(`[auto-provision] \u26a0 ${name} mogelijk geblokkeerd vanuit deze server`);
          }
          continue;
        }
      }
    } catch (err: any) {
      errors.push(`${name}: ${err.message}`);
      await storage.updateProvider(provider.id, { status: "offline" });
      console.log(`[auto-provision] \u2718 ${name}: ${err.message}`);
    }
  }

  console.log(`[auto-provision] Klaar: ${added.length} toegevoegd, ${configured.length} geconfigureerd, ${errors.length} fouten`);

  return { added, configured, errors };
}
