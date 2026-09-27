# Backend da JC Sacolas (VPS). O CONTEXTO do build é a RAIZ do repositório
# (ver docker-compose.yml: context: ..), porque o backend importa ../src/utils.js
# — os helpers de telefone e de número de pedido são os mesmos do navegador.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production TZ=America/Sao_Paulo

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev) && npm cache clean --force

COPY src/utils.js ./src/utils.js
COPY backend/src ./backend/src

# pasta das mídias (volume do compose monta por cima)
RUN mkdir -p /dados/midia && chown -R node:node /dados /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/saude || exit 1
CMD ["node", "backend/src/index.js"]
