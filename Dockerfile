FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node runtime/ ./runtime/
COPY --chown=node:node scripts/public_history_validation.mjs ./scripts/public_history_validation.mjs
RUN mkdir -p /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8789 DATA_DIR=/data TRADING_MODE=PAPER
EXPOSE 8789
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8789/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","runtime/service.mjs"]
