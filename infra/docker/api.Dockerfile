FROM node:22-alpine AS base
WORKDIR /app

COPY package.json .
COPY tsconfig.base.json .
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json

RUN npm install

COPY packages/contracts packages/contracts
COPY apps/api apps/api

RUN npm run build --workspace @sige/contracts
RUN npm run build --workspace @sige/api

CMD ["npm", "run", "start", "--workspace", "@sige/api"]
