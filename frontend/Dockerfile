FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
RUN corepack enable && addgroup -S medix && adduser -S medix -G medix
ENV NODE_ENV=production TZ=Asia/Tashkent NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=medix:medix /app ./
USER medix
EXPOSE 3000
CMD ["pnpm", "start"]
