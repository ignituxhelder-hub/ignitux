# Évaluation de financement — plan de construction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un entrepreneur (offre Entrepreneur) demande une évaluation de financement ; IGINI rédige
le rapport ; un administrateur le revoit (valider / faire refaire / refuser) ; une fois validé,
l'entrepreneur le lit et télécharge un dossier PDF.

**Architecture :** nouveau module Nest `evaluation-financement/` (pur + service + contrôleur),
deux tables Prisma additives, génération IGINI en arrière-plan via `ClaudeService` sous le nom de
générateur `evaluer`. Côté interface : une section dans l'étape « financement » de la fiche projet,
un écran `/evaluations/revue`, une page `/administration` et sa tuile sur le bureau.

**Tech Stack :** NestJS, Prisma 7 (PostgreSQL), Zod, pdfkit, Vitest ; Next.js 15, React, Testing Library.

**Spec :** `docs/superpowers/specs/2026-10-11-evaluation-financement-design.md`

## Global Constraints

- Tout texte visible est en français ; messages de commit en français sans accents, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verdicts, exactement : `financable` (« Finançable en l'état »), `financable_apres_corrections`
  (« Finançable après corrections »), `pas_financable_en_l_etat` (« Pas finançable en l'état »).
- États, exactement : `en_preparation`, `echec`, `en_revue`, `a_refaire`, `validee`, `refusee`.
  Actifs : `en_preparation`, `en_revue`, `a_refaire`.
- Pied de page PDF, exactement : « Évaluation indicative établie à partir des informations
  déclarées par le porteur. Elle ne constitue ni une offre ni une garantie de financement. »
- La section Audit n'apparaît jamais dans le PDF.
- Le contenu du rapport n'est jamais renvoyé à l'entrepreneur avant `validee`.
- Une ligne `en_preparation` de plus de 10 minutes se lit comme `echec`.
- Les migrations sont additives : aucune table existante modifiée.
- Commits à chemins explicites (`git add <fichiers>`), jamais `git add -A` : d'autres sessions
  partagent le dossier.
- Ne jamais pousser : c'est Helder qui pousse (permissions).

## Review Focus

1. **Projet presque vide** (aucune analyse, aucun plan) : la génération doit réussir avec un rapport
   court et une liste `manques` longue, pas échouer → test dans la tâche 3 (prompt sans contexte).
2. **Le modèle renvoie 9 risques ou 1 seule étape** : le rapport est normalisé (risques tronqués à 6,
   étapes à 5 ; moins est accepté), jamais rejeté → test dans la tâche 3.
3. **Double clic sur « Demander »** : deux requêtes concurrentes ne créent qu'une évaluation active →
   test dans la tâche 5 (la seconde reçoit 409).
4. **Redémarrage du serveur pendant la génération** : la ligne bloquée en `en_preparation` s'affiche
   en échec après 10 minutes et l'entrepreneur peut redemander → test dans la tâche 5.
5. **Administrateur qui valide un rapport déjà validé (deux onglets)** : 409, pas de double
   validation → test dans la tâche 6.

---

### Task 1 : tables, migration et périmètre RGPD

**Files :**
- Modify : `backend/prisma/schema.prisma` (deux modèles + relations inverses sur `projects` et `users`)
- Create : `backend/prisma/migrations/20261011100000_evaluation_financement/migration.sql`
- Modify : `backend/src/users/user-data-scope.ts`, `backend/src/users/user-data.service.ts`
- Modify : `backend/test/constitution.e2e-spec.ts` (clés attendues de l'export, si la liste change)
- Test : `backend/src/users/user-data-scope.spec.ts` (existant — il échoue si une table n'est pas classée)

**Interfaces :**
- Produces : modèles Prisma `financing_evaluations` et `financing_evaluation_edits` :
  - `financing_evaluations` : `id` uuid, `project_id` uuid (FK projects, Cascade), `requested_by`
    uuid (FK users, Cascade), `status` String, `verdict` String?, `report` Json?, `ai_draft` Json?,
    `admin_note` String?, `refusal_reason` String?, `redo_instruction` String?, `failure_reason`
    String?, `reviewed_by` uuid? (FK users, SetNull), `reviewed_at` DateTime?, `created_at`,
    `updated_at` ; index `(project_id, created_at)` et `(status, created_at)`.
  - `financing_evaluation_edits` : `id`, `evaluation_id` (FK, Cascade), `editor_id` uuid? (FK users,
    SetNull), `section` String, `before` Json?, `after` Json?, `created_at`.

- [ ] **Step 1 :** ajouter les deux modèles au schéma (style des modèles voisins : `@db.Uuid`,
  `@default(dbgenerated("gen_random_uuid()"))`, commentaires `///` en français).
- [ ] **Step 2 :** écrire la migration SQL à la main (CREATE TABLE + index + FK), dans le style de
  `20261008120000_dossier_creation/migration.sql`.
- [ ] **Step 3 :** `npx prisma generate`, puis lancer `npx vitest run src/users` — attendu : ÉCHEC du
  test de périmètre, les deux tables ne sont pas classées.
- [ ] **Step 4 :** classer les deux tables `exported('contenus_generes_par_igini')` dans
  `USER_DATA_SCOPE`, et les lire dans `user-data.service.ts` (`financing_evaluations.findMany({ where:
  byProject, include: { edits: true } })`). La suppression de compte passe par la cascade.
- [ ] **Step 5 :** `npx vitest run src/users` et `npx tsc --noEmit -p .` — attendu : PASS.
- [ ] **Step 6 :** commit `feat(evaluation): tables financing_evaluations et traces de revue`.

### Task 2 : droit d'offre et nom de générateur

**Files :**
- Modify : `backend/src/igini/usage/generator-names.ts` (ajouter `'evaluer'` à `GENERATOR_NAMES`, hors `GENERATEURS_METHODE`)
- Modify : `backend/src/offres/droits.ts`, test `backend/src/offres/droits.spec.ts`

**Interfaces :**
- Produces : `Action` gagne `{ kind: 'evaluer_financement' }` ; `peut(offreId, { kind:
  'evaluer_financement' })` autorise si `capacites.evaluationFinancement`, sinon refuse avec la
  phrase « L’évaluation de financement n’est pas dans ton offre. » et `offreQuiOuvre` = première
  offre qui l'a. Dans le cas `generer`, `'evaluer'` est traité comme `'executer'` (hors liste,
  borné par le seul quota).

- [ ] **Step 1 : tests**
  ```ts
  it('refuse l’évaluation en Découverte et nomme Entrepreneur', () => {
    const v = peut('decouverte', { kind: 'evaluer_financement' });
    expect(v.autorise).toBe(false);
    expect(v.offreQuiOuvre).toBe('entrepreneur');
  });
  it('autorise l’évaluation en Entrepreneur', () => {
    expect(peut('entrepreneur', { kind: 'evaluer_financement' }).autorise).toBe(true);
  });
  it('laisse « evaluer » passer comme générateur hors méthode, borné par le quota', () => {
    expect(peut('entrepreneur', { kind: 'generer', generateur: 'evaluer', appelsCeMois: 0 }).autorise).toBe(true);
    expect(peut('entrepreneur', { kind: 'generer', generateur: 'evaluer', appelsCeMois: 35 }).autorise).toBe(false);
  });
  ```
  Ajouter aussi `['decouverte', { kind: 'evaluer_financement' }]` au tableau `REFUS` existant.
- [ ] **Step 2 :** `npx vitest run src/offres` — attendu : ÉCHEC (type `evaluer_financement` inconnu).
- [ ] **Step 3 :** implémenter (remplacer `action.generateur === 'executer'` par une liste
  `HORS_METHODE = ['executer', 'evaluer']`).
- [ ] **Step 4 :** `npx vitest run src/offres src/igini/usage` et `npx tsc --noEmit -p .` — PASS.
- [ ] **Step 5 :** commit `feat(offres): droit evaluer_financement et generateur evaluer`.

### Task 3 : schéma du rapport, normalisation et consigne (module pur)

**Files :**
- Create : `backend/src/evaluation-financement/evaluation-model.ts`
- Create : `backend/src/evaluation-financement/evaluation-prompts.ts`
- Test : `backend/src/evaluation-financement/evaluation-model.spec.ts`, `evaluation-prompts.spec.ts`

**Interfaces :**
- Produces (dans `evaluation-model.ts`) :
  - `VERDICTS`, `type Verdict`, `VERDICT_LABEL: Record<Verdict, string>` (libellés des contraintes globales).
  - `STATUTS`, `type StatutEvaluation`, `STATUTS_ACTIFS`.
  - `EvaluationReportSchema` (Zod), `type EvaluationReport` :
    `verdict`, `resume: string`, `montantRecherche: { montantEuros: number | null; source: string }`,
    `usageDesFonds: string`, `audit: { connu: string[]; manques: string[] }`,
    `faisabilite: { marche: string; modeleEconomique: string; capacite: string }`,
    `dossier: { piece: string; etat: 'prete' | 'manquante' }[]`,
    `risques: { risque: string; gravite: 'faible' | 'moyenne' | 'forte'; reduction: string }[]`,
    `pistes: { type: string; pourquoi: string }[]`, `prochainesEtapes: string[]`.
    Les bornes (3 à 6 risques, 3 à 5 étapes, 5 lignes de résumé) vont dans `.describe()`, pas dans
    `.min()/.max()` — convention des autres schémas IGINI (sortie structurée).
  - `SECTIONS_MODIFIABLES = ['verdict','resume','montantRecherche','usageDesFonds','audit','faisabilite','dossier','risques','pistes','prochainesEtapes'] as const`.
  - `normaliserRapport(r: EvaluationReport): EvaluationReport` — tronque `risques` à 6 et
    `prochainesEtapes` à 5 ; n'invente rien quand il y en a moins.
  - `statutLu(statut: string, createdAt: Date, maintenant: Date): StatutEvaluation` — `en_preparation`
    plus vieux que 10 min → `echec`.
- Produces (dans `evaluation-prompts.ts`) : `SYSTEM_PROMPT_EVALUATION` (via `buildSystemPrompt`) et
  `promptEvaluation(titre: string, description: string | null, contexte: string | undefined, consigne?: string): string`.

- [ ] **Step 1 : tests**
  ```ts
  it('tronque à 6 risques et 5 étapes, garde moins sans compléter', () => {
    const r = normaliserRapport(rapport({ risques: neuf, prochainesEtapes: ['a'] }));
    expect(r.risques).toHaveLength(6);
    expect(r.prochainesEtapes).toEqual(['a']);
  });
  it('lit en échec une préparation de plus de 10 minutes', () => {
    expect(statutLu('en_preparation', t0, plus(t0, 11))).toBe('echec');
    expect(statutLu('en_preparation', t0, plus(t0, 9))).toBe('en_preparation');
  });
  it('refuse un verdict hors des trois valeurs', () => {
    expect(EvaluationReportSchema.safeParse(rapport({ verdict: 'peut-etre' })).success).toBe(false);
  });
  it('dit dans la consigne de ne rien inventer et de nommer les manques', () => {
    expect(SYSTEM_PROMPT_EVALUATION).toMatch(/n'invente/i);
    expect(SYSTEM_PROMPT_EVALUATION).toMatch(/manque/i);
  });
  it('produit un prompt valable pour un projet sans aucun contexte', () => {
    expect(promptEvaluation('Boulangerie', null, undefined)).toMatch(/aucune donnée/i);
  });
  it('transmet la consigne de l’administrateur quand elle existe', () => {
    expect(promptEvaluation('B', null, 'ctx', 'reprends le marché')).toContain('reprends le marché');
  });
  ```
- [ ] **Step 2 :** lancer — ÉCHEC (modules absents).
- [ ] **Step 3 :** implémenter. La consigne système reprend la règle d'honnêteté du spec §3.3 :
  s'appuyer uniquement sur le contexte, nommer la source de chaque chiffre, écrire tout manque dans
  `audit.manques`, pistes « à titre d'information, sans recommandation personnalisée ». Sans contexte,
  `promptEvaluation` écrit « Aucune donnée de projet n'est encore disponible au-delà du titre et de
  la description. »
- [ ] **Step 4 :** lancer — PASS.
- [ ] **Step 5 :** commit `feat(evaluation): schema du rapport, normalisation et consigne`.

### Task 4 : dossier PDF (pur)

**Files :**
- Create : `backend/src/evaluation-financement/evaluation-pdf.ts`
- Test : `backend/src/evaluation-financement/evaluation-pdf.spec.ts`

**Interfaces :**
- Consumes : `EvaluationReport`, `VERDICT_LABEL` (tâche 3).
- Produces : `genererDossierPdf(entree: { titreProjet: string; descriptionProjet: string | null;
  rapport: EvaluationReport; noteIgnitux: string | null; valideLe: Date }): Promise<Buffer>` et la
  constante `PIED_DE_PAGE_PDF` (texte des contraintes globales).

- [ ] **Step 1 : tests** — extraire le texte du PDF comme le fait `dossier-creation/dossier-pdf.spec.ts`
  (même technique), puis :
  ```ts
  it('contient la page de garde, le verdict et le pied de page', async () => {
    const texte = await texteDe(await genererDossierPdf(entree()));
    expect(texte).toContain('Dossier de financement');
    expect(texte).toContain('Finançable après corrections');
    expect(texte).toContain('ni une offre ni une garantie de financement');
  });
  it('ne contient jamais la section Audit', async () => {
    const texte = await texteDe(await genererDossierPdf(entree({ audit: { connu: [], manques: ['MANQUE-SECRET'] } })));
    expect(texte).not.toContain('MANQUE-SECRET');
    expect(texte).not.toMatch(/Audit/);
  });
  ```
- [ ] **Step 2 :** lancer — ÉCHEC.
- [ ] **Step 3 :** implémenter avec `pdfkit` dans l'ordre du spec §7 (garde, résumé et verdict,
  présentation + faisabilité, besoin et pistes, risques, pièces) ; pied de page sur chaque page
  (`pageAdded`), comme `dossier-pdf.ts`.
- [ ] **Step 4 :** lancer — PASS.
- [ ] **Step 5 :** commit `feat(evaluation): dossier PDF sans la section audit`.

### Task 5 : service — demande, génération, lecture entrepreneur, PDF

**Files :**
- Create : `backend/src/evaluation-financement/evaluation.service.ts`
- Modify : `backend/src/projects/projects.service.ts` (une méthode publique de contexte)
- Test : `backend/src/evaluation-financement/evaluation.service.spec.ts`

**Interfaces :**
- Consumes : tâches 1 à 4 ; `OffresService.exiger(userId, { kind: 'evaluer_financement' })` ;
  `ClaudeService.generateStructuredOutput({ schema: EvaluationReportSchema, system, userContent,
  logContext, userErrorMessage, usage: { userId, projectId, generator: 'evaluer' } })` ;
  `assertOwnsProject(prisma, userId, projectId)` ; `FinanceAuditService.projectAudit(userId, projectId)`
  (`findings[].label/count`) ; `ComplianceService.listForProject(userId, projectId)`
  (`requirements[].completed`).
- Produces :
  - `ProjectsService.contexteEvaluation(ownerId: string, projectId: string): Promise<{ titre: string;
    description: string | null; contexte: string | undefined }>` — réutilise `personContext`,
    `memoryContext`, `latestAnalysisContext`, `latestBuildPlanContext`, `latestFinancingPlanContext`,
    `latestDevelopmentPlanContext`, `participationContext`, `joinContext`.
  - `EvaluationService` :
    - `demander(userId, projectId): Promise<EvaluationVue>` (201) ;
    - `lister(userId, projectId): Promise<EvaluationVue[]>` (plus récente d'abord) ;
    - `pdf(userId, projectId, evaluationId): Promise<{ fichier: Buffer; nom: string }>` ;
    - `type EvaluationVue = { id; status: StatutEvaluation; createdAt; reviewedAt: Date | null;
      verdict: Verdict | null; rapport: EvaluationReport | null; noteIgnitux: string | null;
      motifRefus: string | null }` — `verdict`, `rapport`, `noteIgnitux` à `null` sauf `validee`.
    - `generer(evaluationId: string, consigne?: string): Promise<void>` (interne, aussi utilisé par la tâche 6).

- [ ] **Step 1 : tests** (Prisma et services simulés, comme `execution.service.spec.ts`)
  ```ts
  it('crée une évaluation en préparation et rend la main avant la fin de la génération', ...);
  it('passe en revue avec ai_draft = report quand IGINI répond', ...);
  it('passe en échec avec failure_reason quand IGINI échoue', ...);
  it('refuse en 409 une seconde demande tant qu’une évaluation est active', ...);
  it('accepte une nouvelle demande quand l’active est bloquée en préparation depuis 11 minutes', ...);
  it('ne crée rien quand l’offre refuse (403) ou quand les générateurs sont éteints (503)', ...);
  it('masque verdict, rapport et note tant que l’évaluation n’est pas validée', ...);
  it('renvoie 404 pour le projet d’un autre', ...);
  it('refuse le PDF (404) d’une évaluation non validée', ...);
  ```
- [ ] **Step 2 :** lancer — ÉCHEC.
- [ ] **Step 3 :** implémenter. `demander` : `assertOwnsProject` → `offres.exiger` → si
  `readGeneratorsAvailability(process.env.IGINI_AI_ENABLED).enabled` est faux
  (`igini/claude/generators-availability.ts`), lever `ServiceUnavailableException(reason)` sans rien
  créer → refuser si une ligne active existe (en
  appliquant `statutLu`) → créer `en_preparation` → lancer `void this.generer(id)` sans l'attendre.
  Course « double clic » : l'insertion se fait dans une transaction `Serializable` qui relit les
  actives ; un conflit de sérialisation se traduit en 409. `generer` : contexte = `contexteEvaluation`
  + résumé de l'audit financier + « X démarches de conformité sur Y faites » ; appel IGINI ;
  `normaliserRapport` ; écrire `report` et `ai_draft` identiques, `verdict`, `status: 'en_revue'` ;
  en cas d'erreur, `status: 'echec'`, `failure_reason`. `pdf` : `genererDossierPdf`, nom
  `dossier-financement-<slug du titre>.pdf`.
- [ ] **Step 4 :** lancer — PASS.
- [ ] **Step 5 :** commit `feat(evaluation): demande, generation et lecture par l'entrepreneur`.

### Task 6 : service — revue par l'administrateur

**Files :**
- Create : `backend/src/evaluation-financement/evaluation-revue.service.ts`
- Test : `backend/src/evaluation-financement/evaluation-revue.service.spec.ts`

**Interfaces :**
- Consumes : `EvaluationService.generer` (tâche 5), `SECTIONS_MODIFIABLES` (tâche 3).
- Produces : `EvaluationRevueService` :
  - `file(): Promise<{ id; projetTitre; entrepreneurEmail; verdict; createdAt }[]>` (`en_revue`, plus ancienne d'abord) ;
  - `detail(id): Promise<{ id; status; projetTitre; entrepreneurEmail; createdAt; rapport; noteIgnitux; traces }>` ;
  - `modifier(adminId, id, changements: { section: SectionModifiable; valeur: unknown }[], noteIgnitux?: string | null)` ;
  - `valider(adminId, id)`, `faireRefaire(adminId, id, consigne: string)`, `refuser(adminId, id, motif: string)`.

- [ ] **Step 1 : tests**
  ```ts
  it('liste seulement les évaluations en revue, la plus ancienne d’abord', ...);
  it('enregistre une trace avant/après pour chaque section modifiée, sans toucher ai_draft', ...);
  it('refuse une valeur de section invalide (le rapport doit rester conforme au schéma)', ...);
  it('valide : statut validee, reviewed_by et reviewed_at posés', ...);
  it('refuse en 409 une seconde validation (déjà validée)', ...);
  it('faire refaire : exige une consigne, repasse en préparation et relance la génération avec elle', ...);
  it('refuser : exige un motif non vide', ...);
  ```
- [ ] **Step 2 :** lancer — ÉCHEC.
- [ ] **Step 3 :** implémenter. Chaque action vérifie `status === 'en_revue'` dans un `updateMany({
  where: { id, status: 'en_revue' } })` dont `count === 0` → 409 (garde contre les deux onglets).
  `modifier` valide le rapport résultant avec `EvaluationReportSchema` avant d'écrire.
- [ ] **Step 4 :** lancer — PASS.
- [ ] **Step 5 :** commit `feat(evaluation): revue administrateur avec traces`.

### Task 7 : contrôleur, module, enregistrement et démarrage réel

**Files :**
- Create : `backend/src/evaluation-financement/evaluation.controller.ts`, `evaluation.module.ts`, `dto/*.ts`
- Modify : `backend/src/app.module.ts`, `backend/src/projects/projects.module.ts` (rien si `ProjectsService` est déjà exporté)
- Test : `backend/src/evaluation-financement/evaluation.controller.spec.ts`

**Interfaces :**
- Produces (routes, toutes sous `JwtAuthGuard`) :
  - `POST /projects/:projectId/evaluations-financement` → `demander` (201)
  - `GET  /projects/:projectId/evaluations-financement` → `lister`
  - `GET  /projects/:projectId/evaluations-financement/:id/pdf` → PDF (`application/pdf`, `Content-Disposition: attachment`)
  - `GET  /evaluations-financement/revue` → `file` (RoleGuard + `@RequireRole('administrateur')`)
  - `GET  /evaluations-financement/revue/:id` → `detail` (admin)
  - `PATCH /evaluations-financement/revue/:id` → `modifier` (admin ; DTO `{ changements, noteIgnitux? }`)
  - `POST /evaluations-financement/revue/:id/valider | /refaire { consigne } | /refuser { motif }` (admin)
- Module : `imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), RolesModule,
  ClaudeModule, OffresModule, ProjectsModule, FinanceAuditModule, ComplianceModule]`,
  `providers: [EvaluationService, EvaluationRevueService, RoleGuard]` (modèle : `identite.module.ts`).

- [ ] **Step 1 : tests** — le contrôleur délègue au bon service avec `user.id` ; les routes de revue
  portent `@RequireRole('administrateur')` (lire les métadonnées avec `Reflector`, comme
  `identite.controller.spec.ts`).
- [ ] **Step 2 :** lancer — ÉCHEC ; implémenter ; relancer — PASS.
- [ ] **Step 3 : démarrage réel** — `npm run build`, puis `PORT=3099 node dist/main` : attendu
  « Nest application successfully started » et `GET /health` → `{"status":"ok"}`. Arrêter le processus.
  (Les tests unitaires remplacent les gardes et ne voient pas une erreur d'injection.)
- [ ] **Step 4 :** commit `feat(evaluation): routes, module et enregistrement`.

### Task 8 : interface — section dans la fiche projet

**Files :**
- Modify : `frontend/src/lib/api.ts` (types `Verdict`, `StatutEvaluation`, `EvaluationReport`,
  `EvaluationVue` miroirs du serveur ; `demanderEvaluation`, `getEvaluations`,
  `telechargerEvaluationPdf` — ce dernier sur le modèle de `telechargerDossierPdf`)
- Create : `frontend/src/app/projects/[id]/evaluation-section.tsx` + `.spec.tsx`
- Modify : `frontend/src/app/projects/[id]/page.tsx` (rendre la section sous le plan de financement,
  `{montrer('financement') && etapeOuverte === 'financement' && <EvaluationSection token={token} projectId={id} readOnly={!isOwner} />}`)

**Interfaces :**
- Produces : `EvaluationSection({ token, projectId, readOnly }: { token: string; projectId: string; readOnly: boolean })`.

- [ ] **Step 1 : tests** (mockApiRoutes, comme `participation-section.spec.tsx`)
  ```tsx
  it('propose « Demander une évaluation » quand il n’y en a aucune', ...);
  it('affiche « En cours de revue par Ignitux » sans aucun contenu du rapport', ...);
  it('affiche le rapport validé : verdict, note signée Ignitux, date, bouton PDF', ...);
  it('affiche le motif d’un refus et permet de redemander', ...);
  it('affiche l’échec et un bouton Réessayer', ...);
  it('en Découverte (403 avec offreQuiOuvre), dit « Comprise dans l’offre Entrepreneur »', ...);
  it('interroge à nouveau l’état tant qu’une évaluation est en préparation', ...);
  it('n’affiche aucun bouton en lecture seule (collaborateur)', ...);
  ```
- [ ] **Step 2 :** lancer — ÉCHEC ; implémenter (sondage toutes les 5 s tant que le statut est
  `en_preparation`, arrêté au démontage) ; relancer — PASS.
- [ ] **Step 3 :** `npx tsc --noEmit` et `npx eslint src/app/projects src/lib/api.ts` — 0 erreur.
- [ ] **Step 4 :** commit `feat(evaluation): section evaluation de financement dans le projet`.

### Task 9 : interface — revue, page Administration, tuile, page des offres

**Files :**
- Modify : `frontend/src/lib/api.ts` (fonctions des routes de revue de la tâche 7)
- Create : `frontend/src/app/evaluations/revue/page.tsx` + `.spec.tsx`
- Create : `frontend/src/app/administration/page.tsx` + `.spec.tsx`
- Modify : `frontend/src/app/accueil/page.tsx` (+ spec) : tuile « Administration » si
  `roles.roles.includes('administrateur')`
- Modify : `frontend/src/app/offres/page.tsx` (+ spec) : retirer « (bientôt disponible) »

- [ ] **Step 1 : tests**
  ```tsx
  // revue
  it('liste la file et ouvre une évaluation', ...);
  it('modifie une section et le verdict, puis valide', ...);
  it('n’envoie pas « Faire refaire » sans consigne ni « Refuser » sans motif', ...);
  // administration
  it('montre les deux files avec le nombre d’évaluations en attente', ...);
  // accueil
  it('montre la tuile Administration au seul administrateur', ...);
  // offres
  it('affiche l’évaluation incluse sans « bientôt disponible »', ...);
  ```
- [ ] **Step 2 :** lancer — ÉCHEC ; implémenter (`/evaluations/revue` sur le modèle de
  `/identite/revue` ; un 403 du serveur affiche « Réservé aux administrateurs ») ; relancer — PASS.
- [ ] **Step 3 :** `npx tsc --noEmit`, `npx eslint .` (hors `.next*`) et `npm run build` — 0 erreur,
  toutes les pages générées.
- [ ] **Step 4 :** commit `feat(evaluation): ecran de revue, page administration et offres a jour`.

### Task 10 : vérification complète et remise à Helder

**Files :**
- Modify : `docs/modele-economique.md` (l'évaluation n'est plus « bientôt disponible »)

- [ ] **Step 1 :** suites complètes : `cd backend && npx vitest run`, `cd frontend && npx vitest run`.
  Un échec isolé dans un fichier non touché se relance seul avant toute conclusion (PC à 8 Go).
- [ ] **Step 2 :** mettre à jour la documentation, commit `docs: evaluation de financement livree`.
- [ ] **Step 3 :** remettre à Helder, en français et pas à pas : (1) dans `backend`, sur cette
  branche, `verifier-base.mjs .env.production` (doit dire ADDITIF, base `ignitux_prod`, tables
  `financing_evaluations` et `financing_evaluation_edits` manquantes), `sauvegarde.mjs --env
  .env.production`, `migrer-prod.mjs --appliquer` ; (2) **ensuite** `git push origin
  feat/evaluation-financement:main` ; (3) vérifier `/ready` puis le parcours sur ignitux.vercel.app.
