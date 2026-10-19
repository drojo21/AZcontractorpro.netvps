# AZ Contractor Pro in one container. For a bare VPS, deploy/install.sh (systemd
# + Caddy) is the simpler path; use this with docker-compose.yml or a Docker PaaS.
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN rm -rf .env .data && mkdir -p /var/lib/acp && chown -R node:node /var/lib/acp

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/var/lib/acp ACP_NO_DOTENV=1
USER node
VOLUME ["/var/lib/acp"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
