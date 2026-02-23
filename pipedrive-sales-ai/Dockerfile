# ---------- Base ----------
FROM node:20-alpine AS base
WORKDIR /app

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# ---------- Builder ----------
FROM base AS builder
COPY . .
# Repo may have project inside pipedrive-sales-ai/ - flatten to /app so prisma/ exists
RUN if [ -d pipedrive-sales-ai ]; then cp -r pipedrive-sales-ai/. . && rm -rf pipedrive-sales-ai; fi
COPY --from=deps /app/node_modules ./node_modules
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# ---------- Production Runner ----------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && npx prisma db seed && node dist/server.js"]
