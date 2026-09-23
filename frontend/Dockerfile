# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════════════════════
# L'INTERFACE IGNITUX
#
# ── Le piège que ce fichier évite ─────────────────────────────────────────
#
# `NEXT_PUBLIC_API_URL` est lue par du code qui tourne dans le navigateur.
# Next l'inscrit donc **dans le paquet JavaScript, au moment du build**, et
# non au démarrage du conteneur. La poser comme variable d'environnement à
# l'exécution ne change rien : l'image contient déjà l'ancienne valeur, et
# l'interface appelle une API qui n'existe pas — sans qu'aucun message
# n'explique pourquoi.
#
# Elle est donc un ARGUMENT DE BUILD. Changer d'adresse d'API veut dire
# reconstruire l'image. C'est le prix d'une interface servie en statique, et
# il vaut mieux le payer en connaissance de cause.
# ═══════════════════════════════════════════════════════════════════════════

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM deps AS build
WORKDIR /app

# L'adresse de l'API, gravée dans le paquet. Voir l'avertissement ci-dessus.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN npm run build


FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

USER node

EXPOSE 3001

# Next ne sert pas de route de santé : on interroge la page de connexion,
# qui est publique et rendue sans base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3001"]
