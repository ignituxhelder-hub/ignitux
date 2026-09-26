# ═══════════════════════════════════════════════════════════════════════════
# SAUVEGARDE QUOTIDIENNE — appelé chaque jour à 02h00 par la tâche planifiée
# « Ignitux - Sauvegarde quotidienne » (voir planifier-taches.ps1).
#
# Réutilise les scripts déjà existants et déjà éprouvés en production
# (backend/scripts/sauvegarde.mjs, backend/scripts/verifier-sauvegarde.mjs)
# plutôt que de réinventer l'export de la base. Couvre :
#   - la base de données (via sauvegarde.mjs) ;
#   - la configuration (.env.docker, backend/.env).
#
# Il n'existe aujourd'hui aucun stockage de fichiers utilisateurs sur disque
# dans Ignitux (tout vit dans Postgres) : il n'y a donc rien d'autre à
# couvrir tant que ça reste vrai. Si un jour un module écrit des fichiers sur
# disque (pièces jointes, exports…), ce script devra être étendu pour les
# inclure.
#
# Chiffrement AES-256-CBC/PBKDF2 par OpenSSL, même principe que
# .github/workflows/sauvegarde.yml : cette sauvegarde peut contenir de vraies
# données, elle ne reste jamais en clair sur le disque plus longtemps que le
# temps de l'archiver.
#
# Protection LOCALE UNIQUEMENT — un incendie, un vol ou une panne matérielle
# de ce PC emporte à la fois les données et leurs sauvegardes. Une copie hors
# site (un autre disque, un stockage cloud) est une amélioration future, qui
# suppose de choisir et payer un prestataire — hors du périmètre ici.
# ═══════════════════════════════════════════════════════════════════════════

. "$PSScriptRoot\configuration.ps1"

function Ecrire-Journal {
    param([string]$Message)
    Add-Content -Path $JournalSauvegarde -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

$horodatage = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dossierJour = Join-Path $DossierSauvegardes $horodatage

try {
    if (-not (Test-Path $FichierPassePhrase)) {
        throw "Passphrase absente : $FichierPassePhrase — voir docs/serveur-maison-installation.md pour la créer avant la première sauvegarde."
    }

    New-Item -ItemType Directory -Path $dossierJour -Force | Out-Null

    Set-Location (Join-Path $RacineDepot 'backend')
    node scripts/sauvegarde.mjs --env .env --sortie $dossierJour
    if ($LASTEXITCODE -ne 0) { throw "sauvegarde.mjs a échoué (voir sa sortie ci-dessus)." }

    $sousDossier = Get-ChildItem -Path $dossierJour -Directory | Select-Object -First 1
    if (-not $sousDossier) { throw "sauvegarde.mjs n'a produit aucun dossier de sortie." }

    node scripts/verifier-sauvegarde.mjs --depuis $sousDossier.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "La vérification a échoué — la sauvegarde $dossierJour est conservée NON chiffrée pour inspection manuelle, elle ne sera pas supprimée automatiquement."
    }

    # Configuration : copiée dans le même dossier daté, avant l'archivage.
    $dossierConfig = Join-Path $dossierJour 'configuration'
    New-Item -ItemType Directory -Path $dossierConfig -Force | Out-Null
    Copy-Item (Join-Path $RacineDepot '.env.docker') $dossierConfig -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $RacineDepot 'backend\.env') $dossierConfig -ErrorAction SilentlyContinue

    $archive = "$dossierJour.zip"
    Compress-Archive -Path $dossierJour -DestinationPath $archive -Force

    $chiffre = "$archive.enc"
    & openssl enc -aes-256-cbc -pbkdf2 -salt -in $archive -out $chiffre -pass "file:$FichierPassePhrase"
    if ($LASTEXITCODE -ne 0) { throw "Le chiffrement OpenSSL a échoué — l'archive non chiffrée $archive est conservée pour inspection." }

    Remove-Item $dossierJour -Recurse -Force
    Remove-Item $archive -Force

    Ecrire-Journal "Sauvegarde réussie : $chiffre"

    # Rotation : ne garder que les N derniers jours.
    Get-ChildItem -Path $DossierSauvegardes -Filter '*.zip.enc' |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$JoursConservationSauvegardes) } |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Ecrire-Journal "Sauvegarde expirée supprimée : $($_.Name)"
        }
} catch {
    Ecrire-Journal "ERREUR : $_"
}
