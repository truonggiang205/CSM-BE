# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
COPY apps/ ./apps/
COPY libs/ ./libs/

RUN npm ci
RUN npm --prefix apps/auth-service run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev && \
    npm cache clean --force

COPY --from=builder /usr/src/app/apps/auth-service/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]
