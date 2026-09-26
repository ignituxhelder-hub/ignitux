# ═══════════════════════════════════════════════════════════════════════════
# PLANIFICATION — enregistre les tâches planifiées Windows de la mise à jour
# automatique et de la sauvegarde quotidienne. Ré-exécutable sans risque :
# une tâche déjà enregistrée est remplacée, jamais dupliquée.
#
# Le tableau de bord n'est PAS ici : il s'installe comme un service Windows
# à part (voir tableau-de-bord/installer-service.mjs), sur le même principe
# que pc-usage-tracker.
#
# ── Pourquoi « à la connexion » et non « au démarrage, sans session » ──────
#
# Docker Desktop tourne dans la session de l'utilisateur connecté — son canal
# nommé (\\.\pipe\docker_engine) n'est pas forcément joignable pour une tâche
# exécutée en tant que SYSTEM avant toute connexion. Ces tâches se lancent
# donc à la connexion de CET utilisateur, dans sa session, là où Docker
# Desktop tourne réellement. Pour qu'Ignitux revienne seul après une coupure
# de courant ou un redémarrage, sans intervention physique, il faut soit :
#   - activer la connexion automatique de Windows pour ce compte
#     (docs/serveur-maison-installation.md explique comment, et le compromis
#     de sécurité que ça représente) ;
#   - soit accepter de devoir se connecter une fois, à la main ou par Bureau
#     à distance via Tailscale (qui, lui, démarre avant toute connexion),
#     après chaque coupure/redémarrage.
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

$utilisateurActuel = "$env:USERDOMAIN\$env:USERNAME"

function Planifier-Repetitive {
    param(
        [string]$Nom,
        [string]$CheminScript,
        [int]$IntervalleMinutes
    )

    Unregister-ScheduledTask -TaskName $Nom -Confirm:$false -ErrorAction SilentlyContinue

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CheminScript`""

    $declencheur = New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalleMinutes) `
        -RepetitionDuration ([TimeSpan]::MaxValue)
    # S'ajoute un déclencheur « à la connexion » pour repartir dès la
    # session ouverte, sans attendre le premier passage des 5 minutes.
    $declencheurConnexion = New-ScheduledTaskTrigger -AtLogOn -User $utilisateurActuel

    $principal = New-ScheduledTaskPrincipal -UserId $utilisateurActuel -LogonType Interactive -RunLevel Highest
    $parametres = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    Register-ScheduledTask -TaskName $Nom -Action $action `
        -Trigger @($declencheur, $declencheurConnexion) -Principal $principal -Settings $parametres | Out-Null

    Write-Host "Planifiée : $Nom (toutes les $IntervalleMinutes min, sous $utilisateurActuel)"
}

function Planifier-Quotidienne {
    param(
        [string]$Nom,
        [string]$CheminScript,
        [string]$Heure
    )

    Unregister-ScheduledTask -TaskName $Nom -Confirm:$false -ErrorAction SilentlyContinue

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CheminScript`""

    $declencheur = New-ScheduledTaskTrigger -Daily -At $Heure

    $principal = New-ScheduledTaskPrincipal -UserId $utilisateurActuel -LogonType Interactive -RunLevel Highest
    $parametres = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    Register-ScheduledTask -TaskName $Nom -Action $action `
        -Trigger $declencheur -Principal $principal -Settings $parametres | Out-Null

    Write-Host "Planifiée : $Nom (chaque jour à $Heure, sous $utilisateurActuel)"
}

Planifier-Repetitive -Nom 'Ignitux - Mise a jour automatique' `
    -CheminScript (Join-Path $PSScriptRoot 'maj-automatique.ps1') -IntervalleMinutes 5

Planifier-Quotidienne -Nom 'Ignitux - Sauvegarde quotidienne' `
    -CheminScript (Join-Path $PSScriptRoot 'sauvegarde-quotidienne.ps1') -Heure '02:00'

Write-Host ""
Write-Host "Tâches enregistrées. Le tableau de bord se planifie à part : voir"
Write-Host "docs/serveur-maison-installation.md et tableau-de-bord/installer-service.mjs."
