# ═══════════════════════════════════════════════════════════════════════════
# PARTAGE DE FICHIERS — un dossier réseau réservé à Ignitux, JAMAIS aux
# fichiers personnels ou familiaux. Rien d'autre ne doit y être déposé.
#
# Accessible uniquement depuis le tailnet (voir pare-feu.ps1) — jamais depuis
# le Wi-Fi de la maison, jamais depuis Internet. Ré-exécutable sans risque :
# un dossier ou un partage déjà présent n'est pas recréé.
#
# À exécuter dans un PowerShell VRAIMENT ouvert en administrateur.
# ═══════════════════════════════════════════════════════════════════════════

. "$PSScriptRoot\configuration.ps1"

$identite = [Security.Principal.WindowsIdentity]::GetCurrent()
$estAdministrateur = (New-Object Security.Principal.WindowsPrincipal($identite)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdministrateur) {
    Write-Error "Ce script doit être exécuté dans un PowerShell ouvert en administrateur."
    exit 1
}

if (Test-Path $DossierPartage) {
    Write-Host "Dossier déjà présent : $DossierPartage"
} else {
    New-Item -ItemType Directory -Path $DossierPartage -Force | Out-Null
    Write-Host "Dossier créé : $DossierPartage"
}

# L'accès est réservé au compte Windows qui installe — pas à « Tout le
# monde » (Everyone). La frontière de sécurité réelle reste Tailscale (voir
# pare-feu.ps1) : ce compte n'est de toute façon atteignable que depuis le
# tailnet, jamais depuis le réseau local ou Internet.
$utilisateurActuel = "$env:USERDOMAIN\$env:USERNAME"

if (Get-SmbShare -Name $NomPartageSMB -ErrorAction SilentlyContinue) {
    Write-Host "Partage déjà présent : $NomPartageSMB"
} else {
    New-SmbShare -Name $NomPartageSMB -Path $DossierPartage -FullAccess $utilisateurActuel | Out-Null
    Write-Host "Partage créé : $NomPartageSMB (accès réservé à $utilisateurActuel)"
}

Write-Host ""
Write-Host "Depuis un autre appareil du tailnet (une fois pare-feu.ps1 exécuté) :"
Write-Host "  Windows : ouvrir \\<adresse-Tailscale-de-ce-PC>\$NomPartageSMB"
Write-Host "  macOS   : Finder -> Aller -> Se connecter au serveur -> smb://<adresse-Tailscale>/$NomPartageSMB"
Write-Host "  (adresse Tailscale de ce PC : tailscale ip -4)"
Write-Host "Identifiants demandés : ceux du compte Windows $utilisateurActuel, sur CE PC."
