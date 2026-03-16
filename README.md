# FreeAI Orchestrator

Een platform dat gratis AI-diensten vindt, configureert en orkestreert. Chat, redeneer, scrape het web, automatiseer browsers, los CAPTCHAs op — alles vanuit één interface.

## Mogelijkheden

- **Chat & Redeneren** — Verbind met 8+ gratis AI-providers (Groq, Gemini, OpenRouter, HuggingFace, SiliconFlow, Cloudflare, GitHub Models, Ollama) met automatische failover
- **Web Scraping** — Haal data op van websites met headless Chromium
- **Browser Automatie** — Navigeer, klik, typ, maak screenshots in een headless browser
- **CAPTCHA Oplossen** — Automatisch reCAPTCHA, hCaptcha en Turnstile oplossen via 2Captcha/CapSolver
- **Task Orchestratie** — Combineer AI + browser acties in multi-step workflows
- **Provider Management** — Configureer API keys, check status, monitor latency

## Tech Stack

- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Browser**: Playwright + Chromium (headless)
- **AI**: Multi-provider met OpenAI-compatible API + Google Gemini + Ollama

## Snel starten

### Optie 1: Docker (aanbevolen)

```bash
# Clone de repo
git clone https://github.com/JOUW-USERNAME/freeai-orchestrator.git
cd freeai-orchestrator

# Configureer environment
cp .env.example .env
# Vul je API keys in (zie .env.example voor instructies)

# Start met Docker
docker compose up -d

# Open http://localhost:5000
```

### Optie 2: Lokaal draaien

```bash
# Vereisten: Node.js 20+, npm

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Configureer environment
cp .env.example .env
# Vul je API keys in

# Development mode
npm run dev

# OF productie build
npm run build
npm start
```

## API Keys configureren

Alle API keys zijn optioneel. Het systeem gebruikt alleen providers waarvoor je een key hebt ingesteld. Je kunt keys configureren op twee manieren:

1. **Via de UI** — Ga naar de "Providers" pagina en vul keys in per provider
2. **Via .env** — Stel keys in als environment variabelen (zie `.env.example`)

### Gratis providers

| Provider | Gratis tier | Aanmelden |
|----------|------------|-----------|
| Groq | 30 RPM, gratis modellen | [console.groq.com](https://console.groq.com) |
| Google Gemini | 15 RPM, Gemini 2.0 Flash | [aistudio.google.com](https://aistudio.google.com) |
| OpenRouter | Gratis modellen beschikbaar | [openrouter.ai](https://openrouter.ai) |
| HuggingFace | Gratis inference API | [huggingface.co](https://huggingface.co) |
| SiliconFlow | Gratis tier | [cloud.siliconflow.cn](https://cloud.siliconflow.cn) |
| Cloudflare Workers AI | 10K requests/dag gratis | [dash.cloudflare.com](https://dash.cloudflare.com) |
| GitHub Models | Gratis voor developers | [github.com/marketplace/models](https://github.com/marketplace/models) |
| Ollama | 100% gratis, lokaal | [ollama.com](https://ollama.com) |

## API Endpoints

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | `/api/providers` | Lijst alle providers |
| PATCH | `/api/providers/:id` | Update provider config |
| POST | `/api/providers/:id/health` | Check provider status |
| POST | `/api/chat` | Chat met AI (auto provider selectie) |
| POST | `/api/tasks` | Maak een nieuwe taak |
| GET | `/api/tasks` | Lijst alle taken |
| POST | `/api/browser/execute` | Voer browser acties uit |

## Projectstructuur

```
freeai-orchestrator/
├── client/               # React frontend
│   └── src/
│       ├── pages/        # Dashboard, Chat, Tasks, Browser, Providers
│       ├── components/   # shadcn/ui componenten
│       └── lib/          # Utils, queryClient, theme
├── server/
│   ├── ai-engine.ts      # Multi-provider AI API calls
│   ├── browser-engine.ts # Playwright browser automatie
│   ├── routes.ts         # Express API routes
│   ├── storage.ts        # In-memory data storage
│   └── index.ts          # Server entry point
├── shared/
│   └── schema.ts         # Gedeeld data model (Drizzle + Zod)
├── Dockerfile            # Production container
├── docker-compose.yml    # One-command deployment
└── .env.example          # Environment template
```

## Licentie

MIT
