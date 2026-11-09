FROM node:22-alpine AS builder

WORKDIR /app


ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_ALLOWED_ORIGINS

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_ALLOWED_ORIGINS=$NEXT_ALLOWED_ORIGINS
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production


COPY package*.json ./
RUN npm ci --omit=dev


COPY --from=builder /app/.next-build ./.next-build
COPY --from=builder /app/public ./public


COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
