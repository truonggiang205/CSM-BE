# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
COPY apps/api-gateway/package*.json ./apps/api-gateway/
COPY apps/auth-service/package*.json ./apps/auth-service/
COPY apps/inventory-service/package*.json ./apps/inventory-service/
COPY apps/notification-service/package*.json ./apps/notification-service/
COPY apps/order-service/package*.json ./apps/order-service/
COPY apps/payment-service/package*.json ./apps/payment-service/
COPY apps/product-service/package*.json ./apps/product-service/
COPY apps/discount-service/package*.json ./apps/discount-service/

RUN --mount=type=cache,target=/root/.npm npm ci

COPY apps/ ./apps/
COPY libs/ ./libs/

RUN npm --prefix apps/discount-service run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
COPY apps/api-gateway/package*.json ./apps/api-gateway/
COPY apps/auth-service/package*.json ./apps/auth-service/
COPY apps/inventory-service/package*.json ./apps/inventory-service/
COPY apps/notification-service/package*.json ./apps/notification-service/
COPY apps/order-service/package*.json ./apps/order-service/
COPY apps/payment-service/package*.json ./apps/payment-service/
COPY apps/product-service/package*.json ./apps/product-service/
COPY apps/discount-service/package*.json ./apps/discount-service/

RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY --from=builder /usr/src/app/apps/discount-service/dist ./dist
COPY --from=builder /usr/src/app/libs/config ./node_modules/@csm/config

EXPOSE 3007
CMD ["node", "dist/main.js"]