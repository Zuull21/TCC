# TourMap — API Node.js
# Debian slim (glibc): o onnxruntime-node, usado pelo modelo de sentimento local,
# não tem binários para Alpine (musl).
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    MODEL_CACHE_DIR=/models

COPY package.json package-lock.json ./
# Sem GPU no servidor: pula o provedor CUDA (~330 MB) e apaga os binários de
# outros sistemas operacionais que o onnxruntime-node traz junto.
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --omit=dev \
 && rm -rf node_modules/onnxruntime-node/bin/napi-v3/darwin \
           node_modules/onnxruntime-node/bin/napi-v3/win32 \
           node_modules/onnxruntime-node/bin/napi-v3/linux/arm64 \
           node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so \
           node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so \
 && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY scripts ./scripts

# O código fica do root (só leitura para o app). Só /models precisa ser gravável:
# é um volume onde os modelos ONNX (~540 MB) são baixados uma vez.
# (Um chown -R em /app duplicaria o node_modules inteiro numa nova camada.)
RUN mkdir -p /models && chown node:node /models
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
