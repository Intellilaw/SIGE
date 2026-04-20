FROM node:22-alpine AS build
WORKDIR /app

COPY package.json .
COPY tsconfig.base.json .
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN npm run build --workspace @sige/contracts
RUN npm run build --workspace @sige/web

CMD ["npm", "run", "preview", "--workspace", "@sige/web"]
