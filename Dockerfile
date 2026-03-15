FROM node:24-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
# python3, make, and g++ are needed for native modules
# ffmpeg is needed for fluent-ffmpeg audio chunking
RUN apk add --no-cache python3 make g++ ffmpeg

COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Rebuild better-sqlite3 for the container architecture
RUN npm rebuild better-sqlite3

COPY . .

# Create volume mount point for database and uploads
RUN mkdir -p uploads
VOLUME /app/uploads
VOLUME /app/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
