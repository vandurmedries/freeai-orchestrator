import {
  type Provider, type InsertProvider,
  type Task, type InsertTask,
  type Message, type InsertMessage,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Providers
  getProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  getProvidersByType(type: string): Promise<Provider[]>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | undefined>;
  deleteProvider(id: string): Promise<boolean>;

  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;

  // Messages
  getMessages(): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  clearMessages(): Promise<void>;
}

export class MemStorage implements IStorage {
  private providers: Map<string, Provider>;
  private tasks: Map<string, Task>;
  private messages: Map<string, Message>;

  constructor() {
    this.providers = new Map();
    this.tasks = new Map();
    this.messages = new Map();
    this.seedProviders();
  }

  private seedProviders() {
    const defaults: InsertProvider[] = [
      {
        name: "Groq (Llama 3.3 70B)",
        type: "chat",
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKeyRequired: true,
        apiKey: "",
        model: "llama-3.3-70b-versatile",
        status: "unknown",
        latencyMs: null,
        rateLimit: "30 req/min free",
        description: "Ultra-fast inference via Groq LPU. Free tier: 30 req/min with API key.",
        config: null,
      },
      {
        name: "Google AI Studio (Gemini)",
        type: "chat",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        apiKeyRequired: true,
        apiKey: "",
        model: "gemini-2.0-flash",
        status: "unknown",
        latencyMs: null,
        rateLimit: "1M tokens/day free",
        description: "Google AI Studio free tier. 1 million tokens/day, Gemini 2.0 Flash.",
        config: null,
      },
      {
        name: "HuggingFace Inference",
        type: "chat",
        endpoint: "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
        apiKeyRequired: true,
        apiKey: "",
        model: "Mistral-7B-Instruct-v0.3",
        status: "unknown",
        latencyMs: null,
        rateLimit: "Rate limited free tier",
        description: "HuggingFace free inference API. Many open-source models available.",
        config: null,
      },
      {
        name: "OpenRouter (Free Models)",
        type: "chat",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKeyRequired: true,
        apiKey: "",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        status: "unknown",
        latencyMs: null,
        rateLimit: "200 req/day free models",
        description: "OpenRouter aggregates free-tier models. Use :free suffix for zero-cost.",
        config: null,
      },
      {
        name: "Cloudflare Workers AI",
        type: "chat",
        endpoint: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct",
        apiKeyRequired: true,
        apiKey: "",
        model: "@cf/meta/llama-3.1-8b-instruct",
        status: "unknown",
        latencyMs: null,
        rateLimit: "10K neurons/day free",
        description: "Cloudflare Workers AI free tier. Run models at the edge.",
        config: null,
      },
      {
        name: "SiliconFlow",
        type: "chat",
        endpoint: "https://api.siliconflow.cn/v1/chat/completions",
        apiKeyRequired: true,
        apiKey: "",
        model: "deepseek-ai/DeepSeek-V3",
        status: "unknown",
        latencyMs: null,
        rateLimit: "Free tier available",
        description: "SiliconFlow: OpenAI-compatible API, fast inference, free tier with DeepSeek V3.",
        config: null,
      },
      {
        name: "Ollama (Local)",
        type: "reasoning",
        endpoint: "http://localhost:11434/api/chat",
        apiKeyRequired: false,
        apiKey: null,
        model: "llama3.3",
        status: "unknown",
        latencyMs: null,
        rateLimit: "Unlimited (local)",
        description: "Local LLM via Ollama. No rate limits, full privacy. Requires Ollama installed.",
        config: null,
      },
      {
        name: "Playwright Browser",
        type: "browser",
        endpoint: "internal://playwright",
        apiKeyRequired: false,
        apiKey: null,
        model: null,
        status: "online",
        latencyMs: null,
        rateLimit: "Unlimited",
        description: "Headless Chromium browser automation. Navigate, click, type, screenshot.",
        config: JSON.stringify({ headless: true, browser: "chromium" }),
      },
      {
        name: "2Captcha",
        type: "captcha",
        endpoint: "https://2captcha.com/in.php",
        apiKeyRequired: true,
        apiKey: "",
        model: null,
        status: "unknown",
        latencyMs: null,
        rateLimit: "$2.99/1000 solves",
        description: "CAPTCHA solving service. Supports reCAPTCHA, hCaptcha, Turnstile, image captchas.",
        config: null,
      },
      {
        name: "CapSolver (AI)",
        type: "captcha",
        endpoint: "https://api.capsolver.com/createTask",
        apiKeyRequired: true,
        apiKey: "",
        model: null,
        status: "unknown",
        latencyMs: null,
        rateLimit: "$0.80/1000 reCAPTCHA",
        description: "AI-powered CAPTCHA solver. 3-5 sec solve time, 99% accuracy, reCAPTCHA/hCaptcha/Turnstile.",
        config: null,
      },
      {
        name: "Puppeteer Stealth",
        type: "browser",
        endpoint: "internal://puppeteer",
        apiKeyRequired: false,
        apiKey: null,
        model: null,
        status: "online",
        latencyMs: null,
        rateLimit: "Unlimited",
        description: "Puppeteer with stealth plugin. Avoids bot detection, fingerprint spoofing.",
        config: JSON.stringify({ headless: "new", stealth: true }),
      },
      {
        name: "GitHub Models",
        type: "reasoning",
        endpoint: "https://models.inference.ai.azure.com/chat/completions",
        apiKeyRequired: true,
        apiKey: "",
        model: "gpt-4o",
        status: "unknown",
        latencyMs: null,
        rateLimit: "Rate limited free tier",
        description: "GitHub Models: free access to GPT-4o, DeepSeek V3, and more with GitHub token.",
        config: null,
      },
    ];

    defaults.forEach((p) => {
      const id = randomUUID();
      this.providers.set(id, { ...p, id });
    });
  }

  // Providers
  async getProviders(): Promise<Provider[]> {
    return Array.from(this.providers.values());
  }
  async getProvider(id: string): Promise<Provider | undefined> {
    return this.providers.get(id);
  }
  async getProvidersByType(type: string): Promise<Provider[]> {
    return Array.from(this.providers.values()).filter((p) => p.type === type);
  }
  async createProvider(insert: InsertProvider): Promise<Provider> {
    const id = randomUUID();
    const provider: Provider = { ...insert, id };
    this.providers.set(id, provider);
    return provider;
  }
  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | undefined> {
    const existing = this.providers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id };
    this.providers.set(id, updated);
    return updated;
  }
  async deleteProvider(id: string): Promise<boolean> {
    return this.providers.delete(id);
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );
  }
  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }
  async createTask(insert: InsertTask): Promise<Task> {
    const id = randomUUID();
    const task: Task = { ...insert, id, createdAt: new Date().toISOString() };
    this.tasks.set(id, task);
    return task;
  }
  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id };
    this.tasks.set(id, updated);
    return updated;
  }

  // Messages
  async getMessages(): Promise<Message[]> {
    return Array.from(this.messages.values()).sort((a, b) =>
      (a.timestamp || "").localeCompare(b.timestamp || "")
    );
  }
  async createMessage(insert: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = { ...insert, id, timestamp: new Date().toISOString() };
    this.messages.set(id, message);
    return message;
  }
  async clearMessages(): Promise<void> {
    this.messages.clear();
  }
}

export const storage = new MemStorage();
