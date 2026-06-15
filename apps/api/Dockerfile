FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN npm run db:generate --workspace @sige/api \
    && npm run build --workspace @sige/contracts \
    && npm run build --workspace @sige/api

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/scripts/dev ./apps/api/scripts/dev
COPY --from=build /app/apps/api/src/config/database-url-guard.ts ./apps/api/src/config/database-url-guard.ts
COPY --from=build /app/apps/api/runtime-assets ./apps/api/runtime-assets
COPY --from=build /app/apps/api/templates ./apps/api/templates

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace", "@sige/api"]
