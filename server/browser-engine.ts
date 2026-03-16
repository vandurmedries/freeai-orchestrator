/**
 * Browser Engine — Real Playwright headless browser automation
 * Handles navigation, clicking, typing, screenshots, data extraction
 */

import type { Provider } from "@shared/schema";

export interface BrowserAction {
  type: "navigate" | "click" | "type" | "screenshot" | "wait" | "captcha" | "extract";
  target?: string;
  value?: string;
}

export interface BrowserResult {
  success: boolean;
  steps: string[];
  output: string;
  screenshot?: string; // base64
  extractedData?: string;
  error?: string;
}

let playwright: any = null;
let browser: any = null;

async function ensureBrowser() {
  if (!playwright) {
    try {
      playwright = await import("playwright");
    } catch {
      throw new Error("Playwright is niet geïnstalleerd. Run: npm install playwright && npx playwright install chromium");
    }
  }
  if (!browser || !browser.isConnected()) {
    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browser;
}

/**
 * Execute a sequence of browser actions
 */
export async function executeBrowserActions(
  url: string,
  actions: BrowserAction[],
  captchaProvider?: Provider
): Promise<BrowserResult> {
  const steps: string[] = [];
  let output = "";
  let screenshot: string | undefined;
  let extractedData: string | undefined;

  try {
    const b = await ensureBrowser();
    steps.push("Headless Chromium gestart");

    const context = await b.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    steps.push("Browser context aangemaakt");

    // Navigate to URL
    if (url && url !== "https://") {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      steps.push(`Navigatie naar ${url} voltooid`);
    }

    // Execute each action
    for (const action of actions) {
      switch (action.type) {
        case "navigate": {
          if (action.target) {
            await page.goto(action.target, { waitUntil: "domcontentloaded", timeout: 30000 });
            steps.push(`Genavigeerd naar: ${action.target}`);
          }
          break;
        }
        case "click": {
          if (action.target) {
            await page.waitForSelector(action.target, { timeout: 10000 });
            await page.click(action.target);
            steps.push(`Geklikt op: ${action.target}`);
          }
          break;
        }
        case "type": {
          if (action.target && action.value) {
            await page.waitForSelector(action.target, { timeout: 10000 });
            await page.fill(action.target, action.value);
            steps.push(`Getypt in ${action.target}: "${action.value.substring(0, 30)}..."`);
          }
          break;
        }
        case "screenshot": {
          const buf = await page.screenshot({ type: "jpeg", quality: 80 });
          screenshot = buf.toString("base64");
          steps.push("Screenshot gemaakt");
          break;
        }
        case "wait": {
          const ms = parseInt(action.value || "2000");
          await page.waitForTimeout(Math.min(ms, 10000));
          steps.push(`Gewacht ${ms}ms`);
          break;
        }
        case "captcha": {
          steps.push("CAPTCHA gedetecteerd...");
          if (captchaProvider && captchaProvider.apiKey) {
            const solved = await solveCaptcha(page, captchaProvider);
            steps.push(solved ? "CAPTCHA opgelost!" : "CAPTCHA oplossen mislukt");
          } else {
            steps.push("Geen CAPTCHA solver geconfigureerd — sla over");
          }
          break;
        }
        case "extract": {
          const selector = action.target || "body";
          const content = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel);
            return el ? el.textContent?.trim() || el.innerHTML : "Element niet gevonden";
          }, selector);
          extractedData = content;
          steps.push(`Data geëxtraheerd uit: ${selector} (${content.length} tekens)`);
          break;
        }
      }
    }

    // Get final page info
    const title = await page.title();
    const currentUrl = page.url();
    output = `Pagina: "${title}" — ${currentUrl}`;

    if (extractedData) {
      output += `\n\nGeëxtraheerde data:\n${extractedData.substring(0, 5000)}`;
    }

    // Take final screenshot if none taken
    if (!screenshot) {
      const buf = await page.screenshot({ type: "jpeg", quality: 80 });
      screenshot = buf.toString("base64");
      steps.push("Eind-screenshot gemaakt");
    }

    await context.close();
    steps.push("Browser context gesloten");

    return { success: true, steps, output, screenshot, extractedData };
  } catch (err: any) {
    steps.push(`Fout: ${err.message}`);
    return { success: false, steps, output: "", error: err.message };
  }
}

/**
 * Simple scraping: navigate and extract content
 */
export async function scrapePage(url: string): Promise<BrowserResult> {
  return executeBrowserActions(url, [
    { type: "extract", target: "body" },
    { type: "screenshot" },
  ]);
}

/**
 * CAPTCHA solving (2Captcha or CapSolver)
 */
async function solveCaptcha(page: any, provider: Provider): Promise<boolean> {
  try {
    // Detect captcha type
    const captchaInfo = await page.evaluate(() => {
      // reCAPTCHA
      const recaptcha = document.querySelector('[data-sitekey]') as HTMLElement;
      if (recaptcha) {
        return { type: "recaptcha", sitekey: recaptcha.getAttribute("data-sitekey") };
      }
      // hCaptcha
      const hcaptcha = document.querySelector('[data-hcaptcha-sitekey]') as HTMLElement;
      if (hcaptcha) {
        return { type: "hcaptcha", sitekey: hcaptcha.getAttribute("data-hcaptcha-sitekey") };
      }
      // Turnstile
      const turnstile = document.querySelector('[data-turnstile-sitekey]') as HTMLElement;
      if (turnstile) {
        return { type: "turnstile", sitekey: turnstile.getAttribute("data-turnstile-sitekey") };
      }
      return null;
    });

    if (!captchaInfo) return false;

    if (provider.endpoint.includes("2captcha")) {
      return await solve2Captcha(provider.apiKey!, captchaInfo, page.url());
    } else if (provider.endpoint.includes("capsolver")) {
      return await solveCapSolver(provider.apiKey!, captchaInfo, page.url());
    }

    return false;
  } catch {
    return false;
  }
}

async function solve2Captcha(
  apiKey: string,
  captchaInfo: { type: string; sitekey: string },
  pageUrl: string
): Promise<boolean> {
  try {
    // Submit task
    const method = captchaInfo.type === "hcaptcha" ? "hcaptcha" : "userrecaptcha";
    const submitUrl = `https://2captcha.com/in.php?key=${apiKey}&method=${method}&googlekey=${captchaInfo.sitekey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;

    const submitRes = await fetch(submitUrl);
    const submitData = await submitRes.json();
    if (submitData.status !== 1) return false;

    const taskId = submitData.request;

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const resultUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`;
      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();

      if (resultData.status === 1) return true;
      if (resultData.request !== "CAPCHA_NOT_READY") return false;
    }

    return false;
  } catch {
    return false;
  }
}

async function solveCapSolver(
  apiKey: string,
  captchaInfo: { type: string; sitekey: string },
  pageUrl: string
): Promise<boolean> {
  try {
    const taskType =
      captchaInfo.type === "hcaptcha" ? "HCaptchaTaskProxyLess" :
      captchaInfo.type === "turnstile" ? "AntiTurnstileTaskProxyLess" :
      "ReCaptchaV2TaskProxyLess";

    const createRes = await fetch("https://api.capsolver.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: taskType,
          websiteURL: pageUrl,
          websiteKey: captchaInfo.sitekey,
        },
      }),
    });
    const createData = await createRes.json();
    if (createData.errorId !== 0) return false;

    const taskId = createData.taskId;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const getRes = await fetch("https://api.capsolver.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });
      const getData = await getRes.json();

      if (getData.status === "ready") return true;
      if (getData.status === "failed") return false;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Cleanup: close browser
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
