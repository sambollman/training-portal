FROM node:20-alpine AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install
COPY server/ ./
COPY --from=client-build /client/dist ./client/dist

EXPOSE 3000
CMD ["node", "index.js"]
