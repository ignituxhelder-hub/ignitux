# ═══════════════════════════════════════════════════════════════════════════
# MISE À JOUR AUTOMATIQUE — appelé toutes les 5 minutes par la tâche planifiée
# « Ignitux - Mise a jour automatique » (voir planifier-taches.ps1).
#
# Le dépôt GitHub d'Ignitux est PUBLIC : ce script lit (git fetch/pull) sans
# aucun identifiant. Il ne pousse jamais rien.
#
# `docker compose up -d --build` reconstruit ce qui a changé et laisse le
# reste : les Dockerfile de backend/ et frontend/ copient package*.json et
# lancent `npm ci` avant le reste des sources, donc Docker ne réinstalle les
# dépendances que si package-lock.json a réellement changé — aucune étape
# séparée n'est nécessaire ici pour ça côté conteneurs.
#
# Un `npm ci`/`npm run build` séparé, sur l'hôte, reste nécessaire malgré
# tout : sauvegarde-quotidienne.ps1 tourne hors conteneur et importe le
# client Prisma compilé dans backend\dist — voir plus bas.
# ═══════════════════════════════════════════════════════════════════════════

. "$PSScriptRoot\configuration.ps1"

function Ecrire-Journal {
    param([string]$Message)
    $horodatage = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $JournalMaj -Value "[$horodatage] $Message"
}

# Garde contre deux passages qui se chevauchent : si un build précédent tourne
# encore quand les 5 minutes suivantes sonnent, on attend plutôt que de lancer
# un second `docker compose up` en parallèle. Un verrou de plus de 30 minutes
# est considéré comme abandonné (crash, coupure de courant) et retiré.
if (Test-Path $FichierVerrouMaj) {
    $age = (Get-Date) - (Get-Item $FichierVerrouMaj).LastWriteTime
    if ($age.TotalMinutes -lt 30) {
        Ecrire-Journal "Une mise à jour est déjà en cours (verrou de $([int]$age.TotalMinutes) min) — on attend le prochain passage."
        exit 0
    }
    Ecrire-Journal "Verrou périmé ($([int]$age.TotalMinutes) min) : abandonné, on le retire."
    Remove-Item $FichierVerrouMaj -Force
}
New-Item -ItemType File -Path $FichierVerrouMaj -Force | Out-Null

try {
    Set-Location $RacineDepot

    git fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) { throw "git fetch a échoué (réseau ? GitHub inaccessible ?)." }

    $ancien = (git rev-parse HEAD).Trim()
    $distant = (git rev-parse origin/main).Trim()

    if ($ancien -eq $distant) {
        # Pas de bruit dans le journal à chaque passage sans rien de neuf —
        # seule la dernière ligne « rien de nouveau » compte pour le débogage.
        exit 0
    }

    Ecrire-Journal "Nouveau commit détecté : $ancien -> $distant"

    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw "git pull a échoué (avance rapide impossible : le dépôt local a-t-il été modifié à la main ?)." }

    docker compose --env-file .env.docker up -d --build
    if ($LASTEXITCODE -ne 0) { throw "docker compose up a échoué." }

    # La sauvegarde quotidienne (sauvegarde-quotidienne.ps1) tourne sur
    # l'hôte, pas dans le conteneur, et importe le client Prisma compilé
    # dans backend\dist. Sans reconstruire ici aussi, ce dist reste sur
    # l'ancien schéma après un `git pull` qui en change un — la sauvegarde
    # continuerait de tourner, mais sur des tables qui n'existent plus ou en
    # ignorant les nouvelles.
    Push-Location (Join-Path $RacineDepot 'backend')
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci (hôte, backend) a échoué." }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build (hôte, backend) a échoué." }
    } finally {
        Pop-Location
    }

    Start-Sleep -Seconds 5
    $sante = $false
    try {
        $reponse = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 10
        $sante = ($reponse.StatusCode -eq 200)
    } catch {
        $sante = $false
    }

    $version = (git describe --tags --always).Trim()
    $etat = @{
        version       = $version
        commitMessage = (git log -1 --format=%s).Trim()
        commitAuteur  = (git log -1 --format=%an).Trim()
        commitDate    = (git log -1 --format=%cI).Trim()
        derniereMaj   = (Get-Date).ToString('o')
        succes        = $sante
    }
    $etat | ConvertTo-Json | Set-Content -Path $FichierEtat -Encoding UTF8

    if ($sante) {
        Ecrire-Journal "Mise à jour terminée avec succès. Version déployée : $version."
    } else {
        Ecrire-Journal "ATTENTION : mise à jour appliquée ($version) mais /health ne répond pas — vérifier les conteneurs."
    }
} catch {
    Ecrire-Journal "ERREUR : $_"
} finally {
    Remove-Item $FichierVerrouMaj -Force -ErrorAction SilentlyContinue
}
