FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json .
COPY package-lock.json .
COPY tsconfig.base.json .
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm ci

COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web/package.json apps/web/package.json
COPY apps/web/src/features/tasks apps/web/src/features/tasks

RUN npm run db:generate --workspace @sige/api
RUN npm run build --workspace @sige/contracts
RUN npm run build --workspace @sige/api

CMD ["npx", "tsx", "apps/api/src/server.ts"]
