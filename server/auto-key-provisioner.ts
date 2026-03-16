/**
 * Auto-Key-Provisioner — Automatisch API keys ophalen bij providers
 * 
 * Strategieën:
 * 1. Key-vrij: DuckDuckGo, Blackbox, Puter.js → direct bruikbaar
 * 2. Auto-register: Headless browser registreert automatisch bij providers
 *    met temp-email, haalt key op, valideert en slaat op
 * 3. Env-based: Keys uit environment variabelen laden
 * 
 * De app doet alles zelf — de gebruiker hoeft niets te doen.
 */

import { storage } from "./storage";
import { executeBrowserActions, type BrowserAction } from "./browser-engine";
import type { Provider } from "@shared/schema";

// ============================================================
// Temp Email Service — Maakt disposable emails aan voor registratie
// ============================================================

interface TempEmail {
  address: string;
  token: string;
}

interface TempMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  textBody: string;
  date: string;
}

/**
 * Maak een tijdelijke email aan via mail.tm (gratis, geen key nodig)
 */
async function createTempEmail(): Promise<TempEmail> {
  // Stap 1: Beschikbare domeinen ophalen
  const domainsRes = await fetch("https://api.mail.tm/domains");
  const domainsData = await domainsRes.json();
  const domain = domainsData["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("Geen temp-mail domein beschikbaar");

  // Stap 2: Willekeurig emailadres genereren
  const randomId = `freeai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const address = `${randomId}@${domain}`;
  const password = `FreeAI${Date.now()}!`;

  // Stap 3: Account aanmaken
  const createRes = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!createRes.ok) {
    throw new Error(`Temp email aanmaken mislukt: ${createRes.status}`);
  }

  // Stap 4: Inloggen om JWT token te krijgen
  const tokenRes = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Temp email login mislukt: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  return { address, token: tokenData.token };
}

/**
 * Wacht op een email in de temp inbox
 */
async function waitForEmail(
  token: string,
  maxWaitMs: number = 120000,
  filterSubject?: string
): Promise<TempMessage | null> {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch("https://api.mail.tm/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        const messages = data["hydra:member"] || [];
        
        for (const msg of messages) {
          if (!filterSubject || msg.subject?.toLowerCase().includes(filterSubject.toLowerCase())) {
            // Volledige bericht ophalen
            const fullRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (fullRes.ok) {
              const fullMsg = await fullRes.json();
              return {
                id: fullMsg.id,
                from: fullMsg.from?.address || "",
                subject: fullMsg.subject || "",
                body: fullMsg.html?.[0] || fullMsg.text || "",
                textBody: fullMsg.text || "",
                date: fullMsg.createdAt || "",
              };
            }
          }
        }
      }
    } catch {
      // Negeer fouten, probeer opnieuw
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return null;
}

/**
 * Extraheer een verificatielink of code uit een email body
 */
function extractVerificationFromEmail(body: string): { link?: string; code?: string } {
  // Zoek verificatielinks
  const linkPatterns = [
    /https?:\/\/[^\s"<>]+(?:verify|confirm|activate|validate)[^\s"<>]*/gi,
    /href="(https?:\/\/[^"]+(?:verify|confirm|activate|validate)[^"]*)"/gi,
  ];

  for (const pattern of linkPatterns) {
    const match = body.match(pattern);
    if (match) {
      let link = match[0];
      if (link.startsWith('href="')) {
        link = link.slice(6, -1);
      }
      return { link };
    }
  }

  // Zoek verificatiecodes (4-8 cijfers/letters)
  const codePatterns = [
    /(?:code|verificatie|verif)[:\s]*([A-Z0-9]{4,8})/i,
    /\b(\d{6})\b/,
  ];

  for (const pattern of codePatterns) {
    const match = body.match(pattern);
    if (match) {
      return { code: match[1] };
    }
  }

  return {};
}

// ============================================================
// Provider Auto-Registration Recipes
// ============================================================

interface AutoRegisterRecipe {
  providerId: string;
  providerName: string;
  difficulty: "easy" | "medium" | "hard";
  requiresCaptcha: boolean;
  steps: string[];
  execute: (email: TempEmail, captchaProvider?: Provider) => Promise<{
    success: boolean;
    apiKey?: string;
    error?: string;
    steps: string[];
  }>;
}

/**
 * Groq — Registreren is eenvoudig maar vereist Google/GitHub OAuth
 * Kan niet volledig automatisch, maar we proberen het
 */
const groqRecipe: AutoRegisterRecipe = {
  providerId: "groq",
  providerName: "Groq",
  difficulty: "hard",
  requiresCaptcha: false,
  steps: [
    "Navigeer naar console.groq.com",
    "OAuth login vereist (Google/GitHub) — kan niet volledig automatisch",
  ],
  execute: async () => ({
    success: false,
    error: "Groq vereist Google/GitHub OAuth login — niet automatisch mogelijk",
    steps: ["Groq vereist OAuth login, overgeslagen"],
  }),
};

/**
 * HuggingFace — Registratie met email is mogelijk
 */
const huggingfaceRecipe: AutoRegisterRecipe = {
  providerId: "huggingface",
  providerName: "HuggingFace",
  difficulty: "medium",
  requiresCaptcha: true,
  steps: [
    "Maak temp-email aan",
    "Navigeer naar huggingface.co/join",
    "Vul registratieformulier in",
    "Verifieer email",
    "Maak API token aan",
    "Sla token op",
  ],
  execute: async (email: TempEmail, captchaProvider?: Provider) => {
    const steps: string[] = [];
    try {
      steps.push("Navigeer naar HuggingFace registratie...");
      
      const password = `FreeAI${Date.now()}Hf!`;
      const username = email.address.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 20);

      const actions: BrowserAction[] = [
        { type: "navigate", target: "https://huggingface.co/join" },
        { type: "wait", value: "3000" },
        // Vul formulier in
        { type: "type", target: "input[name='email'], #email", value: email.address },
        { type: "type", target: "input[name='password'], #password", value: password },
        { type: "type", target: "input[name='username'], #username", value: username },
        // CAPTCHA als beschikbaar
        { type: "captcha" },
        // Submit
        { type: "click", target: "button[type='submit']" },
        { type: "wait", value: "5000" },
        { type: "screenshot" },
      ];

      const result = await executeBrowserActions("https://huggingface.co/join", actions, captchaProvider);
      steps.push(...result.steps);

      if (!result.success) {
        return { success: false, error: result.error, steps };
      }

      // Wacht op verificatie-email
      steps.push("Wacht op verificatie-email...");
      const verifyEmail = await waitForEmail(email.token, 120000, "verify");
      
      if (!verifyEmail) {
        return { success: false, error: "Geen verificatie-email ontvangen", steps };
      }

      // Extraheer verificatielink
      const { link } = extractVerificationFromEmail(verifyEmail.body);
      if (link) {
        steps.push(`Verificatielink gevonden: ${link.slice(0, 50)}...`);
        const verifyResult = await executeBrowserActions(link, [
          { type: "wait", value: "3000" },
          { type: "screenshot" },
        ]);
        steps.push(...verifyResult.steps);
      }

      // Login en maak token aan
      steps.push("Navigeer naar token aanmaak...");
      const tokenActions: BrowserAction[] = [
        { type: "navigate", target: "https://huggingface.co/settings/tokens/new?tokenType=read" },
        { type: "wait", value: "3000" },
        { type: "type", target: "input[name='description'], input[name='name'], #name", value: "FreeAI-Orchestrator" },
        { type: "click", target: "button[type='submit'], button:has-text('Create')" },
        { type: "wait", value: "3000" },
        { type: "extract", target: "input[readonly], code, pre, [class*='token'], [data-testid*='token']" },
        { type: "screenshot" },
      ];

      const tokenResult = await executeBrowserActions("https://huggingface.co/login", tokenActions);
      steps.push(...tokenResult.steps);

      // Zoek de token in de output
      const hfPattern = /hf_[A-Za-z0-9]{34,}/;
      const match = (tokenResult.extractedData || tokenResult.output || "").match(hfPattern);
      
      if (match) {
        steps.push(`HuggingFace token gevonden: ${match[0].slice(0, 8)}...`);
        return { success: true, apiKey: match[0], steps };
      }

      return { success: false, error: "Kon token niet extraheren", steps };
    } catch (err: any) {
      steps.push(`Fout: ${err.message}`);
      return { success: false, error: err.message, steps };
    }
  },
};

/**
 * OpenRouter — Registratie via email of Google OAuth
 */
const openrouterRecipe: AutoRegisterRecipe = {
  providerId: "openrouter",
  providerName: "OpenRouter",
  difficulty: "hard",
  requiresCaptcha: false,
  steps: [
    "OpenRouter vereist Google/GitHub OAuth of email + verificatie",
    "Na login: navigeer naar settings/keys, maak key aan",
  ],
  execute: async () => ({
    success: false,
    error: "OpenRouter vereist OAuth login — niet automatisch mogelijk",
    steps: ["OpenRouter vereist OAuth login, overgeslagen"],
  }),
};

/**
 * Gemini — Google AI Studio, vereist Google OAuth
 */
const geminiRecipe: AutoRegisterRecipe = {
  providerId: "gemini",
  providerName: "Google AI Studio (Gemini)",
  difficulty: "hard",
  requiresCaptcha: false,
  steps: ["Google AI Studio vereist Google OAuth login"],
  execute: async () => ({
    success: false,
    error: "Google AI Studio vereist Google account login — niet automatisch mogelijk",
    steps: ["Google AI Studio vereist OAuth login, overgeslagen"],
  }),
};

// Lijst van alle auto-register recepten
export const AUTO_REGISTER_RECIPES: AutoRegisterRecipe[] = [
  groqRecipe,
  huggingfaceRecipe,
  openrouterRecipe,
  geminiRecipe,
];

// ============================================================
// Hoofd Auto-Key-Provisioning Engine
// ============================================================

export interface AutoProvisionResult {
  providerId: string;
  providerName: string;
  method: string;
  success: boolean;
  apiKey?: string;
  error?: string;
  steps: string[];
}

/**
 * Voer automatische key provisioning uit voor één provider
 */
export async function autoProvisionKey(
  providerId: string
): Promise<AutoProvisionResult> {
  const recipe = AUTO_REGISTER_RECIPES.find(r => r.providerId === providerId);
  if (!recipe) {
    return {
      providerId,
      providerName: providerId,
      method: "unknown",
      success: false,
      error: "Geen auto-register recept beschikbaar",
      steps: [],
    };
  }

  console.log(`[auto-key] Auto-provisioning starten voor ${recipe.providerName}...`);

  // Maak temp email aan als nodig
  let tempEmail: TempEmail | undefined;
  if (recipe.difficulty !== "hard") {
    try {
      tempEmail = await createTempEmail();
      console.log(`[auto-key] Temp email aangemaakt: ${tempEmail.address}`);
    } catch (err: any) {
      return {
        providerId,
        providerName: recipe.providerName,
        method: "auto_register",
        success: false,
        error: `Temp email fout: ${err.message}`,
        steps: [`Fout bij aanmaken temp email: ${err.message}`],
      };
    }
  }

  // Zoek captcha provider
  const captchaProviders = await storage.getProvidersByType("captcha");
  const captchaProvider = captchaProviders.find(p => p.apiKey && p.apiKey.length > 0);

  // Voer het recept uit
  const result = await recipe.execute(
    tempEmail || { address: "", token: "" },
    captchaProvider || undefined
  );

  // Als succesvol, sla key op
  if (result.success && result.apiKey) {
    const providers = await storage.getProviders();
    const matching = providers.find(p =>
      p.name.toLowerCase().includes(recipe.providerId.toLowerCase())
    );
    if (matching) {
      await storage.updateProvider(matching.id, {
        apiKey: result.apiKey,
        status: "online",
      });
      console.log(`[auto-key] ✔ ${recipe.providerName} key opgeslagen`);
    }
  }

  return {
    providerId,
    providerName: recipe.providerName,
    method: recipe.difficulty === "hard" ? "oauth_required" : "auto_register",
    ...result,
  };
}

/**
 * Probeer alle providers automatisch te configureren
 */
export async function autoProvisionAllKeys(): Promise<AutoProvisionResult[]> {
  const results: AutoProvisionResult[] = [];
  const providers = await storage.getProviders();

  for (const recipe of AUTO_REGISTER_RECIPES) {
    // Check of provider al een key heeft
    const existing = providers.find(p =>
      p.name.toLowerCase().includes(recipe.providerId.toLowerCase())
    );
    
    if (existing?.apiKey && existing.apiKey.length > 0) {
      results.push({
        providerId: recipe.providerId,
        providerName: recipe.providerName,
        method: "already_configured",
        success: true,
        steps: ["Key al aanwezig"],
      });
      continue;
    }

    // Skip "hard" providers (OAuth vereist)
    if (recipe.difficulty === "hard") {
      results.push({
        providerId: recipe.providerId,
        providerName: recipe.providerName,
        method: "oauth_required",
        success: false,
        error: "Vereist handmatige OAuth login",
        steps: ["OAuth login vereist — overgeslagen bij automatische provisioning"],
      });
      continue;
    }

    // Probeer automatisch
    const result = await autoProvisionKey(recipe.providerId);
    results.push(result);
  }

  return results;
}

/**
 * Geeft overzicht van welke providers automatisch kunnen en welke niet
 */
export function getAutoProvisionStatus(): Array<{
  providerId: string;
  providerName: string;
  method: string;
  canAutoProvision: boolean;
  difficulty: string;
  reason: string;
}> {
  return AUTO_REGISTER_RECIPES.map(recipe => ({
    providerId: recipe.providerId,
    providerName: recipe.providerName,
    method: recipe.difficulty === "hard" ? "oauth_required" : "auto_register",
    canAutoProvision: recipe.difficulty !== "hard",
    difficulty: recipe.difficulty,
    reason: recipe.difficulty === "hard"
      ? "Vereist OAuth login (Google/GitHub) — alleen handmatig mogelijk"
      : recipe.difficulty === "medium"
        ? "Kan automatisch met temp-email en headless browser"
        : "Eenvoudig, volledig automatisch",
  }));
}
