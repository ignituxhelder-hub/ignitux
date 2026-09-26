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

$secretJwt = Nouveau-SecretAleatoire

# Détectée une seule fois ici : sert à la fois à l'interface (build) et à
# l'API (CORS) — si le navigateur ouvre http://<IP>:3001, l'API doit
# accepter cette même origine, pas « localhost ».
$adresseTailscale = $null
try {
    $sortie = & tailscale ip -4 2>$null
    if ($LASTEXITCODE -eq 0 -and $sortie) { $adresseTailscale = ($sortie | Select-Object -First 1).Trim() }
} catch {}

$envDocker = Join-Path $RacineDepot '.env.docker'
if (Test-Path $envDocker) {
    Write-Host ".env.docker déjà présent — pas touché."
} else {
    Copy-Item (Join-Path $RacineDepot '.env.docker.example') $envDocker
    $contenu = Get-Content -Raw -Path $envDocker
    $contenu = $contenu -replace 'JWT_SECRET=""', "JWT_SECRET=`"$secretJwt`""
    if ($adresseTailscale) {
        $contenu = $contenu -replace 'NEXT_PUBLIC_API_URL="http://localhost:3000"', "NEXT_PUBLIC_API_URL=`"http://${adresseTailscale}:3000`""
        $contenu = $contenu -replace 'FRONTEND_URL="http://localhost:3001"', "FRONTEND_URL=`"http://${adresseTailscale}:3001`""
    }
    Set-Content -Path $envDocker -Value $contenu -Encoding UTF8
    Write-Host "CRÉÉ ET REMPLI : .env.docker (JWT_SECRET généré automatiquement)."
    if ($adresseTailscale) {
        Write-Host "  Adresse Tailscale détectée et posée : $adresseTailscale"
    } else {
        Write-Host "  Adresse Tailscale NON détectée (Tailscale bien connecté ?) — à remplir"
        Write-Host "  à la main dans .env.docker : NEXT_PUBLIC_API_URL et FRONTEND_URL,"
        Write-Host "  avec le résultat de 'tailscale ip -4'."
    }
}

$envBackend = Join-Path $RacineDepot 'backend\.env'
if (Test-Path $envBackend) {
    Write-Host "backend\.env déjà présent — pas touché."
} else {
    Copy-Item (Join-Path $RacineDepot 'backend\.env.example') $envBackend
    $contenu = Get-Content -Raw -Path $envBackend
    # Mêmes identifiants que les valeurs par défaut de .env.docker
    # (POSTGRES_USER/PASSWORD/DB) — à ajuster à la main si tu les as changées.
    $contenu = $contenu -replace 'DATABASE_URL="postgresql://user:password@host:5432/postgres"', 'DATABASE_URL="postgresql://ignitux:ignitux@localhost:5432/ignitux"'
    $contenu = $contenu -replace 'JWT_SECRET="change-me-generate-a-long-random-secret"', "JWT_SECRET=`"$secretJwt`""
    Set-Content -Path $envBackend -Value $contenu -Encoding UTF8
    Write-Host "CRÉÉ ET REMPLI : backend\.env (mêmes valeurs que .env.docker)."
}

if (-not (Test-Path $FichierPassePhrase)) {
    Nouveau-SecretAleatoire | Out-File -Encoding ascii -NoNewline $FichierPassePhrase
    Write-Host ""
    Write-Host "Passphrase de sauvegarde générée : $FichierPassePhrase"
    Write-Host "Mets-en une copie ailleurs aussi (gestionnaire de mots de passe, clé USB"
    Write-Host "séparée) — sans copie de secours, une sauvegarde chiffrée perdue avec"
    Write-Host "elle est illisible pour toujours. La voir : Get-Content `"$FichierPassePhrase`""
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
Write-Host "  1. Si l'adresse Tailscale n'a pas été détectée plus haut : la remplir"
Write-Host "     à la main dans .env.docker (NEXT_PUBLIC_API_URL, FRONTEND_URL)."
Write-Host "  2. Premier démarrage : docker compose --env-file .env.docker up -d --build"
Write-Host "  3. Poser le schéma : cd backend; npx prisma db push"
Write-Host "  4. npm ci; npm run build (dans backend\ — nécessaire à la sauvegarde nocturne)"
Write-Host "  5. Installer le tableau de bord : cd tableau-de-bord; npm install; npm run installer-service"
Write-Host "  6. Vérifier depuis un autre appareil du tailnet : http://<IP-Tailscale>:3001"
Write-Host "══════════════════════════════════════════════════════════════════"
