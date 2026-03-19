FROM node:24-alpine

WORKDIR /app

# Install build/runtime dependencies for native SQLite drivers and ffmpeg.
RUN apk add --no-cache python3 make g++ ffmpeg pkgconfig

COPY package*.json ./

# Install production dependencies
RUN npm_config_build_from_source=true npm ci --omit=dev

# Rebuild native modules for the container architecture
RUN npm rebuild better-sqlite3 --build-from-source && npm rebuild better-sqlite3-multiple-ciphers --build-from-source

COPY . .

# Create an unprivileged runtime user and ensure writable app directories
RUN adduser -D -h /app appuser && mkdir -p /app/uploads /app/data && chown -R appuser:appuser /app

USER appuser

# Create volume mount point for database and uploads
VOLUME /app/uploads
VOLUME /app/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
