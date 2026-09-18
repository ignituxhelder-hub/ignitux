# Ignitux — Frontend

Application Next.js (App Router) qui consomme l'API backend : inscription, connexion, création et liste de projets.

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # ajuster NEXT_PUBLIC_API_URL si besoin
npm run dev
```

L'app tourne sur http://localhost:3001. Le backend (voir `../backend`) doit tourner sur http://localhost:3000 (CORS déjà configuré côté backend pour ce port).

## Structure

- `src/lib/api.ts` — client HTTP vers le backend
- `src/lib/auth.tsx` — contexte d'authentification (token + utilisateur en `localStorage`)
- `src/app/` — pages : accueil, inscription, connexion, liste/création de projets
