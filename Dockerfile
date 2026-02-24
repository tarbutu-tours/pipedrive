# Use this Dockerfile when repo root is parent of pipedrive-sales-ai/
# Render uses repo root, so project is at pipedrive-sales-ai/

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY pipedrive-sales-ai/package.json pipedrive-sales-ai/package-lock.json* ./
RUN npm install --ignore-scripts

FROM base AS builder
COPY pipedrive-sales-ai/ .
# Fail build if ui.ts still registers GET /login (would duplicate server.ts and crash at runtime)
RUN ! grep -q 'get("/login"' src/routes/ui.ts || (echo "ERROR: Remove GET /login from src/routes/ui.ts (served in server.ts)" && exit 1)
COPY --from=deps /app/node_modules ./node_modules
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build
RUN cp -r src/ui dist/ || true

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && npx prisma db seed && node dist/server.js"]
