# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION PARTAGÉE DU SERVEUR MAISON
#
# Tous les autres scripts de ce dossier commencent par :
#   . "$PSScriptRoot\configuration.ps1"
# — un seul endroit à modifier si un chemin, un port ou un délai doit changer.
# ═══════════════════════════════════════════════════════════════════════════

# Racine du dépôt : ce dossier (serveur-maison) est directement sous elle.
$RacineDepot = Split-Path -Parent $PSScriptRoot

# Journaux et état (verrou, dernière mise à jour) : jamais versionnés,
# voir .gitignore.
$DossierJournaux = Join-Path $PSScriptRoot 'journaux'
if (-not (Test-Path $DossierJournaux)) {
    New-Item -ItemType Directory -Path $DossierJournaux -Force | Out-Null
}
$FichierEtat = Join-Path $DossierJournaux 'etat.json'
$FichierVerrouMaj = Join-Path $DossierJournaux 'maj.verrou'
$JournalMaj = Join-Path $DossierJournaux 'maj-automatique.log'
$JournalSauvegarde = Join-Path $DossierJournaux 'sauvegarde.log'

# Sauvegardes : volontairement HORS du dépôt (dossier frère), pour qu'un
# `git clean`/`git pull` ne puisse jamais les toucher.
$DossierSauvegardes = Join-Path (Split-Path -Parent $RacineDepot) 'ignitux-sauvegardes'
if (-not (Test-Path $DossierSauvegardes)) {
    New-Item -ItemType Directory -Path $DossierSauvegardes -Force | Out-Null
}
# Le sel du chiffrement : un fichier local, jamais versionné, jamais envoyé
# nulle part. Sans lui, les sauvegardes chiffrées sont illisibles pour
# toujours — voir docs/serveur-maison-installation.md pour le créer et le
# mettre en sûreté (un gestionnaire de mots de passe, une clé USB séparée).
$FichierPassePhrase = Join-Path $DossierSauvegardes '.passphrase'
$JoursConservationSauvegardes = 14

# Port du tableau de bord — hors de 3000 (API), 3001 (interface) et
# 4100/4101 (pc-usage-tracker, un outil sans rapport).
$PortTableauDeBord = 3210

# Plage d'adresses Tailscale (CGNAT) : sert aux règles de pare-feu, pour
# n'ouvrir ces ports qu'au tailnet et jamais au reste du réseau local ou
# d'Internet.
$PlageTailscale = '100.64.0.0/10'

# Partage de fichiers — réservé à Ignitux, jamais aux fichiers personnels ou
# familiaux (voir partage-fichiers.ps1). Un dossier frère du dépôt, comme les
# sauvegardes, pour qu'un `git pull`/`git clean` ne le touche jamais.
$DossierPartage = 'C:\Partage-Ignitux'
$NomPartageSMB = 'Ignitux'
