# De bestelserver (Node.js) voor Fly.io of een andere host die containers draait.
# De database staat in /data: koppel daar een vaste schijf (volume) aan, anders gaan bestellingen verloren bij een nieuwe uitrol.
FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
EXPOSE 3000
RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
