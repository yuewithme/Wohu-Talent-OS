FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY server ./server
RUN ./node_modules/.bin/esbuild server/index.ts --bundle --platform=node --format=esm --outfile=/app/service.mjs
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/service.mjs ./service.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "--env-file-if-exists=/app/.env", "service.mjs"]
