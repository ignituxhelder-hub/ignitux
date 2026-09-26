# ═══════════════════════════════════════════════════════════════════════════
# PARE-FEU — n'ouvrir ces ports qu'au tailnet
#
# Ignitux se rend accessible à distance par Tailscale, jamais par une
# redirection de port sur la box internet. Ces règles bornent l'ouverture à
# la plage d'adresses Tailscale (100.64.0.0/10) : un appareil du réseau local
# ou d'Internet qui tente de s'y connecter n'obtient rien, seul un appareil
# du tailnet peut.
#
# NE JAMAIS configurer de redirection de port sur la box pour 3000, 3001 ou
# le port du tableau de bord — Tailscale rend cela inutile, et le ferait
# revenir à publier le serveur sur Internet.
#
# À exécuter dans un PowerShell VRAIMENT ouvert en administrateur (clic droit
# → « Exécuter en tant qu'administrateur »), pas seulement dans un terminal
# qui le prétend — sans cela, New-NetFirewallRule échoue silencieusement ou
# avec un message qui n'explique pas pourquoi.
# ═══════════════════════════════════════════════════════════════════════════

. "$PSScriptRoot\configuration.ps1"

$identite = [Security.Principal.WindowsIdentity]::GetCurrent()
$estAdministrateur = (New-Object Security.Principal.WindowsPrincipal($identite)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdministrateur) {
    Write-Error "Ce script doit être exécuté dans un PowerShell ouvert en administrateur."
    exit 1
}

$regles = @(
    @{ Nom = 'Ignitux - API (Tailscale)'; Port = 3000 }
    @{ Nom = 'Ignitux - Interface (Tailscale)'; Port = 3001 }
    @{ Nom = 'Ignitux - Tableau de bord (Tailscale)'; Port = $PortTableauDeBord }
    # SMB (partage de fichiers, voir partage-fichiers.ps1). Ne JAMAIS élargir
    # cette règle au réseau local ou rediriger ce port sur la box internet :
    # SMB exposé publiquement est une porte d'entrée classique (rançongiciels).
    @{ Nom = 'Ignitux - Partage de fichiers (Tailscale)'; Port = 445 }
)

foreach ($regle in $regles) {
    $existe = Get-NetFirewallRule -DisplayName $regle.Nom -ErrorAction SilentlyContinue
    if ($existe) {
        Write-Host "Déjà présente : $($regle.Nom)"
        continue
    }

    New-NetFirewallRule `
        -DisplayName $regle.Nom `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $regle.Port `
        -RemoteAddress $PlageTailscale `
        -Profile Any | Out-Null

    Write-Host "Créée : $($regle.Nom) (port $($regle.Port), depuis $PlageTailscale seulement)"
}

Write-Host ""
Write-Host "Rappel : aucune redirection de port ne doit exister sur la box internet pour ces ports."
