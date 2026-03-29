# Build dashboard static assets, then run the Node server (API + WebSocket + optional auto-signals).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run dashboard:build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DASHBOARD_HOST=0.0.0.0
ENV DASHBOARD_PORT=3020
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dashboard-dist ./dashboard-dist
COPY src ./src
RUN mkdir -p runtime
EXPOSE 3020
CMD ["node", "src/dashboardServer.js"]
