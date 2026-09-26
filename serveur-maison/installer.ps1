# ═══════════════════════════════════════════════════════════════════════════
# INSTALLATEUR — geste unique, à exécuter SUR LE PC SERVEUR, dans un
# PowerShell VRAIMENT ouvert en administrateur.
#
# Ce script installe les outils, vérifie le dépôt, prépare la configuration
# et enregistre les tâches planifiées. Il ne fait rien d'irréversible sans
# le dire : il s'arrête et explique quand il te faut remplir quelque chose
# à la main (secrets, adresse Tailscale).
#
# Lire docs/serveur-maison-installation.md avant de lancer ceci — ce script
# en est le résumé exécutable, pas un remplacement.
# ═══════════════════════════════════════════════════════════════════════════

. "$PSScriptRoot\configuration.ps1"

$identite = [Security.Principal.WindowsIdentity]::GetCurrent()
$estAdministrateur = (New-Object Security.Principal.WindowsPrincipal($identite)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdministrateur) {
    Write-Error "Ce script doit être exécuté dans un PowerShell ouvert en administrateur."
    exit 1
}

Write-Host "── 1. Outils ──────────────────────────────────────────────────────"

function Assurer-Outil {
    param([string]$Commande, [string]$PaquetWinget, [string]$Nom)

    if (Get-Command $Commande -ErrorAction SilentlyContinue) {
        Write-Host "$Nom déjà présent."
        return
    }

    Write-Host "$Nom absent — installation via winget ($PaquetWinget)…"
    winget install --id $PaquetWinget --exact --accept-source-agreements --accept-package-agreements
    Write-Host "$Nom installé. Une nouvelle fenêtre PowerShell sera nécessaire pour que son PATH soit pris en compte."
}

Assurer-Outil -Commande 'git' -PaquetWinget 'Git.Git' -Nom 'Git'
Assurer-Outil -Commande 'node' -PaquetWinget 'OpenJS.NodeJS.LTS' -Nom 'Node.js'
Assurer-Outil -Commande 'docker' -PaquetWinget 'Docker.DockerDesktop' -Nom 'Docker Desktop'

if (Get-Command 'tailscale' -ErrorAction SilentlyContinue) {
    Write-Host "Tailscale déjà présent."
} else {
    Write-Host "Tailscale : pas détecté ici — pas installé par ce script (tu l'installes/le configures toi-même, voir la doc)."
}

Write-Host ""
Write-Host "── 2. Dépôt ───────────────────────────────────────────────────────"

if (Test-Path (Join-Path $RacineDepot '.git')) {
    Write-Host "Dépôt déjà cloné : $RacineDepot"
} else {
    Write-Error "Ce script s'attend à être lancé DEPUIS le dossier serveur-maison d'un dépôt déjà cloné. Clone d'abord : git clone https://github.com/<org>/<depot>.git"
    exit 1
}

Write-Host ""
Write-Host "── 3. Configuration ───────────────────────────────────────────────"

$envDocker = Join-Path $RacineDepot '.env.docker'
if (Test-Path $envDocker) {
    Write-Host ".env.docker déjà présent — pas touché."
} else {
    Copy-Item (Join-Path $RacineDepot '.env.docker.example') $envDocker
    Write-Host "CRÉÉ : .env.docker — à REMPLIR à la main avant de continuer :"
    Write-Host "  - JWT_SECRET (générer avec : openssl rand -base64 48)"
    Write-Host "  - NEXT_PUBLIC_API_URL : l'adresse Tailscale de CE PC, ex. http://100.x.x.x:3000"
    Write-Host "    (jamais http://localhost:3000 — sinon l'interface s'appellera elle-même en boucle"
    Write-Host "     une fois ouverte depuis un autre appareil du tailnet)"
}

$envBackend = Join-Path $RacineDepot 'backend\.env'
if (Test-Path $envBackend) {
    Write-Host "backend\.env déjà présent — pas touché."
} else {
    Copy-Item (Join-Path $RacineDepot 'backend\.env.example') $envBackend
    Write-Host "CRÉÉ : backend\.env — à REMPLIR à la main (DATABASE_URL, JWT_SECRET — les mêmes valeurs que .env.docker)."
}

if (-not (Test-Path $FichierPassePhrase)) {
    Write-Host ""
    Write-Host "Passphrase de sauvegarde absente : $FichierPassePhrase"
    Write-Host "Génère-la et mets-la en sûreté AILLEURS aussi (gestionnaire de mots de"
    Write-Host "passe, clé USB séparée) — sans copie de secours, une sauvegarde chiffrée"
    Write-Host "perdue avec elle est illisible pour toujours :"
    Write-Host '  openssl rand -base64 48 | Out-File -Encoding ascii -NoNewline "' -NoNewline
    Write-Host "$FichierPassePhrase`""
}

Write-Host ""
Write-Host "── 4. Partage de fichiers (Ignitux uniquement) ──────────────────────"
& "$PSScriptRoot\partage-fichiers.ps1"

Write-Host ""
Write-Host "── 5. Pare-feu ────────────────────────────────────────────────────"
& "$PSScriptRoot\pare-feu.ps1"

Write-Host ""
Write-Host "── 6. Tâches planifiées ────────────────────────────────────────────"
& "$PSScriptRoot\planifier-taches.ps1"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════════"
Write-Host "PROCHAINES ÉTAPES À FAIRE À LA MAIN (voir docs/serveur-maison-installation.md) :"
Write-Host "  1. Remplir .env.docker et backend\.env si ce n'est pas déjà fait."
Write-Host "  2. Premier démarrage : docker compose --env-file .env.docker up -d --build"
Write-Host "  3. Poser le schéma : cd backend; npx prisma db push"
Write-Host "  4. Installer le tableau de bord : cd tableau-de-bord; npm install; npm run installer-service"
Write-Host "  5. Vérifier depuis un autre appareil du tailnet : http://<IP-Tailscale>:3001"
Write-Host "══════════════════════════════════════════════════════════════════"
