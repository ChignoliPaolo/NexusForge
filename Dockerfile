FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node frontend ./frontend
RUN mkdir -p /app/runtime && chown node:node /app/runtime
USER node
ENV HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:8000/api/health').then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
