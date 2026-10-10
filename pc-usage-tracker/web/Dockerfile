# syntax=docker/dockerfile:1
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Doit être fourni AU BUILD : Vite grave VITE_API_URL dans le bundle statique
# au moment de `vite build`. Le changer après coup demande de reconstruire
# l'image, pas seulement de redémarrer le conteneur.
ARG VITE_API_URL=http://localhost:4100
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 4101
CMD ["serve", "-s", "dist", "-l", "4101"]
