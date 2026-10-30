# syntax=docker/dockerfile:1

# Production dependencies only. This stage is thrown away, so the pnpm store
# (about 45 MB) never reaches the runtime image.
FROM node:24-alpine AS deps
ENV NODE_ENV=production
WORKDIR /app
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]
