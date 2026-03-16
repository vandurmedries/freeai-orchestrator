import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProviderSchema, insertTaskSchema, insertMessageSchema } from "@shared/schema";
import { chat, chatWithFailover, type ChatMessage } from "./ai-engine";
import { executeBrowserActions, scrapePage, type BrowserAction } from "./browser-engine";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ====== PROVIDERS ======
  app.get("/api/providers", async (_req, res) => {
    const providers = await storage.getProviders();
    res.json(providers);
  });

  app.get("/api/providers/:id", async (req, res) => {
    const provider = await storage.getProvider(req.params.id);
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  });

  app.get("/api/providers/type/:type", async (req, res) => {
    const providers = await storage.getProvidersByType(req.params.type);
    res.json(providers);
  });

  app.post("/api/providers", async (req, res) => {
    const result = insertProviderSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues });
    const provider = await storage.createProvider(result.data);
    res.status(201).json(provider);
  });

  app.patch("/api/providers/:id", async (req, res) => {
    const provider = await storage.updateProvider(req.params.id, req.body);
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  });

  app.delete("/api/providers/:id", async (req, res) => {
    const deleted = await storage.deleteProvider(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Provider not found" });
    res.json({ success: true });
  });

  // Health check a provider
  app.post("/api/providers/:id/health", async (req, res) => {
    const provider = await storage.getProvider(req.params.id);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const start = Date.now();
    let status = "offline";
    let latencyMs = 0;

    try {
      if (provider.endpoint.startsWith("internal://")) {
        status = "online";
        latencyMs = 5;
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(provider.endpoint, {
          method: "HEAD",
          signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timeout);
        latencyMs = Date.now() - start;
        status = response ? (response.ok || response.status === 401 || response.status === 405 || response.status === 400 || response.status === 415 ? "online" : "degraded") : "offline";
      }
    } catch {
      latencyMs = Date.now() - start;
      status = "offline";
    }

    const updated = await storage.updateProvider(provider.id, { status, latencyMs });
    res.json(updated);
  });

  // Batch health check
  app.post("/api/providers/health-all", async (_req, res) => {
    const providers = await storage.getProviders();
    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        const start = Date.now();
        let status = "offline";
        let latencyMs = 0;

        try {
          if (provider.endpoint.startsWith("internal://")) {
            status = "online";
            latencyMs = 5;
          } else {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(provider.endpoint, {
              method: "HEAD",
              signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeout);
            latencyMs = Date.now() - start;
            status = response ? (response.ok || response.status === 401 || response.status === 405 || response.status === 400 || response.status === 415 ? "online" : "degraded") : "offline";
          }
        } catch {
          latencyMs = Date.now() - start;
          status = "offline";
        }

        return storage.updateProvider(provider.id, { status, latencyMs });
      })
    );

    const updated = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map(r => r.value)
      .filter(Boolean);

    res.json(updated);
  });

  // ====== TASKS ======
  app.get("/api/tasks", async (_req, res) => {
    const tasks = await storage.getTasks();
    res.json(tasks);
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await storage.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  });

  app.post("/api/tasks", async (req, res) => {
    const result = insertTaskSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues });
    const task = await storage.createTask(result.data);
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const task = await storage.updateTask(req.params.id, req.body);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  });

  // ====== EXECUTE TASK (Real orchestration) ======
  app.post("/api/tasks/:id/execute", async (req, res) => {
    const task = await storage.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await storage.updateTask(task.id, { status: "running" });
    const steps: string[] = [];
    let output = "";

    try {
      switch (task.type) {
        case "chat": {
          steps.push("Beste chat provider zoeken...");
          const chatProviders = await storage.getProvidersByType("chat");
          const reasoningProviders = await storage.getProvidersByType("reasoning");
          const allAI = [...chatProviders, ...reasoningProviders];

          steps.push(`${allAI.length} providers gevonden, failover actief`);
          const messages: ChatMessage[] = [
            { role: "system", content: "Je bent een behulpzame AI-assistent. Antwoord in het Nederlands tenzij de gebruiker een andere taal gebruikt." },
            { role: "user", content: task.input },
          ];

          const response = await chatWithFailover(allAI, messages);
          steps.push(`Antwoord van ${response.providerName} (${response.latencyMs}ms)`);
          output = response.content;
          break;
        }

        case "scrape": {
          steps.push("Headless browser starten...");
          steps.push(`Navigeren naar: ${task.input}`);
          const result = await scrapePage(task.input);
          steps.push(...result.steps);
          output = result.output;
          if (result.error) {
            throw new Error(result.error);
          }
          break;
        }

        case "browse": {
          steps.push("Headless Chromium starten...");
          let browseUrl = task.input;
          let actions: BrowserAction[] = [];

          // Check if input is JSON with actions
          try {
            const parsed = JSON.parse(task.input);
            browseUrl = parsed.url || task.input;
            actions = parsed.actions || [];
          } catch {
            // Plain URL, just navigate and screenshot
            actions = [{ type: "screenshot" }];
          }

          const captchaProviders = await storage.getProvidersByType("captcha");
          const captchaProvider = captchaProviders.find(p => p.apiKey && p.apiKey.length > 0);

          const result = await executeBrowserActions(browseUrl, actions, captchaProvider);
          steps.push(...result.steps);
          output = result.output;
          if (result.error) {
            throw new Error(result.error);
          }
          break;
        }

        case "register": {
          steps.push("Registratie-flow analyseren...");
          let regInput;
          try {
            regInput = JSON.parse(task.input);
          } catch {
            regInput = { url: task.input };
          }

          const regActions: BrowserAction[] = [
            { type: "screenshot" },
            // The actual form fields should be specified in the input
          ];

          if (regInput.fields) {
            for (const [selector, value] of Object.entries(regInput.fields)) {
              regActions.push({ type: "type", target: selector, value: value as string });
            }
          }
          if (regInput.submitButton) {
            regActions.push({ type: "captcha" });
            regActions.push({ type: "click", target: regInput.submitButton });
          }
          regActions.push({ type: "screenshot" });

          const captchaProviders = await storage.getProvidersByType("captcha");
          const captchaProvider = captchaProviders.find(p => p.apiKey && p.apiKey.length > 0);

          const result = await executeBrowserActions(regInput.url, regActions, captchaProvider);
          steps.push(...result.steps);
          output = result.output;
          break;
        }

        case "plan": {
          steps.push("Multi-stap planning starten...");
          const chatProviders = await storage.getProvidersByType("chat");
          const reasoningProviders = await storage.getProvidersByType("reasoning");
          const allAI = [...chatProviders, ...reasoningProviders];

          const planMessages: ChatMessage[] = [
            {
              role: "system",
              content: `Je bent een taak-planner. Analyseer het doel van de gebruiker en maak een gedetailleerd stappenplan.
Je hebt beschikking over:
- Chat/reasoning AI (${chatProviders.length} providers)
- Headless browser voor navigeren, klikken, typen
- CAPTCHA oplossers
- Web scraping

Geef het plan als genummerde stappen met voor elke stap het type actie (chat/scrape/browse/register).`,
            },
            { role: "user", content: task.input },
          ];

          const planResponse = await chatWithFailover(allAI, planMessages);
          steps.push(`Plan gegenereerd door ${planResponse.providerName}`);
          output = planResponse.content;
          break;
        }

        case "multi": {
          steps.push("Multi-stap taak starten...");
          // First plan, then execute each step
          const chatProviders2 = await storage.getProvidersByType("chat");
          const reasoningProviders2 = await storage.getProvidersByType("reasoning");
          const allAI2 = [...chatProviders2, ...reasoningProviders2];

          const planResponse2 = await chatWithFailover(allAI2, [
            { role: "system", content: "Analyseer dit doel en geef een JSON array van stappen. Elk object heeft: {type: 'chat'|'scrape'|'browse', input: '...'}" },
            { role: "user", content: task.input },
          ]);
          steps.push("Plan gegenereerd");

          // Try to parse and execute sub-steps
          output = `Plan:\n${planResponse2.content}`;
          break;
        }

        default: {
          steps.push("Taak verwerken...");
          output = `Onbekend taaktype: ${task.type}`;
        }
      }

      await storage.updateTask(task.id, {
        status: "completed",
        output,
        steps: JSON.stringify(steps),
      });
    } catch (err: any) {
      steps.push(`FOUT: ${err.message}`);
      await storage.updateTask(task.id, {
        status: "failed",
        output: `Fout: ${err.message}`,
        steps: JSON.stringify(steps),
      });
    }

    const updated = await storage.getTask(task.id);
    res.json(updated);
  });

  // ====== MESSAGES (Chat with real AI) ======
  app.get("/api/messages", async (_req, res) => {
    const messages = await storage.getMessages();
    res.json(messages);
  });

  app.post("/api/messages", async (req, res) => {
    const result = insertMessageSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues });
    const message = await storage.createMessage(result.data);

    // If user message, call real AI
    if (result.data.role === "user") {
      const chatProviders = await storage.getProvidersByType("chat");
      const reasoningProviders = await storage.getProvidersByType("reasoning");
      const allAI = [...chatProviders, ...reasoningProviders];

      // Build conversation history
      const history = await storage.getMessages();
      const chatMessages: ChatMessage[] = [
        {
          role: "system",
          content: "Je bent FreeAI Orchestrator, een behulpzame AI-assistent. Je kunt chatten, redeneren, websites scrapen, browser-acties uitvoeren, en CAPTCHAs oplossen. Antwoord in het Nederlands tenzij de gebruiker een andere taal spreekt.",
        },
        ...history.slice(-10).map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      try {
        const aiResponse = await chatWithFailover(allAI, chatMessages);

        const assistantMsg = await storage.createMessage({
          role: "assistant",
          content: aiResponse.content,
          providerId: aiResponse.providerId,
          model: aiResponse.model,
        });

        // Update provider latency
        await storage.updateProvider(aiResponse.providerId, {
          status: "online",
          latencyMs: aiResponse.latencyMs,
        });

        return res.json({ userMessage: message, assistantMessage: assistantMsg });
      } catch (err: any) {
        const errorMsg = await storage.createMessage({
          role: "assistant",
          content: `⚠️ ${err.message}\n\nConfigureer je API keys op de Providers pagina om de AI te activeren.`,
          providerId: null,
          model: null,
        });
        return res.json({ userMessage: message, assistantMessage: errorMsg });
      }
    }

    res.json({ userMessage: message });
  });

  app.delete("/api/messages", async (_req, res) => {
    await storage.clearMessages();
    res.json({ success: true });
  });

  // ====== BROWSER DIRECT ======
  app.post("/api/browser/execute", async (req, res) => {
    const { url, actions } = req.body;
    if (!url) return res.status(400).json({ error: "URL is vereist" });

    const captchaProviders = await storage.getProvidersByType("captcha");
    const captchaProvider = captchaProviders.find(p => p.apiKey && p.apiKey.length > 0);

    const result = await executeBrowserActions(url, actions || [], captchaProvider);
    res.json(result);
  });

  app.post("/api/browser/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is vereist" });

    const result = await scrapePage(url);
    res.json(result);
  });

  // ====== STATS ======
  app.get("/api/stats", async (_req, res) => {
    const providers = await storage.getProviders();
    const tasks = await storage.getTasks();
    const messages = await storage.getMessages();

    res.json({
      totalProviders: providers.length,
      onlineProviders: providers.filter(p => p.status === "online").length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === "completed").length,
      runningTasks: tasks.filter(t => t.status === "running").length,
      failedTasks: tasks.filter(t => t.status === "failed").length,
      totalMessages: messages.length,
      providersByType: {
        chat: providers.filter(p => p.type === "chat").length,
        reasoning: providers.filter(p => p.type === "reasoning").length,
        browser: providers.filter(p => p.type === "browser").length,
        captcha: providers.filter(p => p.type === "captcha").length,
      },
    });
  });

  return httpServer;
}
