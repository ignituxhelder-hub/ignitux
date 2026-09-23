# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════════════════════
# LE SERVEUR IGNITUX
#
# Trois étages, pour une raison qui se voit à l'usage : l'image finale ne
# contient ni les sources TypeScript, ni les dépendances de développement,
# ni les tests. Ce qui n'est pas embarqué ne peut ni grossir l'image, ni
# être exécuté par accident en production.
#
# ── Ce qui ne se fait PAS ici ──────────────────────────────────────────────
#
# Aucune migration au démarrage. `prisma db push` dans un point d'entrée
# semble pratique jusqu'au jour où deux conteneurs démarrent en même temps
# et modifient le schéma simultanément. La migration est un geste décidé,
# lancé une fois, pas un effet de bord du démarrage.
# ═══════════════════════════════════════════════════════════════════════════

FROM node:24-slim AS deps
WORKDIR /app
# OpenSSL : Prisma en a besoin pour se connecter en TLS, et l'image slim ne
# l'embarque pas. Son absence ne se voit qu'à la première connexion.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci


FROM deps AS build
WORKDIR /app
COPY . .
# Le client Prisma est généré à partir du schéma, pas de la base : une URL
# factice suffit, et la vraie n'a rien à faire dans une couche d'image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build


FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Dépendances de production seulement.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# `dist/` contient déjà le client Prisma compilé (`dist/generated/prisma/`) :
# il est généré dans `src/` puis transpilé avec le reste. Le copier une
# seconde fois depuis `src/` alourdissait l'image de sources TypeScript qui
# n'y ont rien à faire — vérifié sur un build réel avant de le retirer.
COPY --from=build /app/dist ./dist
# Le schéma reste utile : `prisma db push` et les scripts de sauvegarde le
# lisent, et on veut pouvoir les lancer depuis le conteneur.
COPY --from=build /app/prisma ./prisma

# Ne pas tourner en root. Le compte `node` existe dans l'image officielle.
USER node

EXPOSE 3000

# `/health` répond « le process est vivant et la base répond ». Distinct de
# `/ready`, qui dit en plus si le serveur est en état de travailler — celui-là
# sert à un superviseur, pas à un répartiteur de charge.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
