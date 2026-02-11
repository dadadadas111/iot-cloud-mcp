FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production=false && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3001

CMD ["node", "dist/main"]
