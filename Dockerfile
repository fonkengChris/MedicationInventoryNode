# Highly optimized multi-stage build for Node.js backend
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user early
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Dependencies stage - install only production deps
FROM base AS dependencies
COPY package*.json ./

# Use npm ci with optimizations
RUN npm ci --only=production --no-audit --no-fund --prefer-offline && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Production stage - minimal image
FROM node:18-alpine AS production

# Install dumb-init and timezone data
RUN apk add --no-cache \
    dumb-init \
    tzdata \
    && rm -rf /tmp/* /var/cache/apk/*

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy only production dependencies
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code with proper ownership
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files
RUN rm -rf \
    .git \
    .gitignore \
    *.md \
    backup_db \
    logs \
    node_modules/.cache \
    && find . -name "*.log" -delete

# Set production environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    TZ=UTC

# Create logs directory
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check with wget (lighter than node)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]