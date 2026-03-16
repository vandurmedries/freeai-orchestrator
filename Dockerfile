# FreeAI Orchestrator — Production Dockerfile
# Node.js + Playwright + Chromium voor headless browser automation

FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source & build
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-slim

WORKDIR /app

# Install Playwright system dependencies + Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy built output
COPY --from=builder /app/dist ./dist

# Environment
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/ || exit 1

# Run
CMD ["node", "dist/index.cjs"]
