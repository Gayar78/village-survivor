# Applique les migrations du jeu à la base auto-hébergée du déploiement LAN.
#
# Elles ne peuvent pas être jouées à l'initialisation de Postgres : la migration 0001
# référence `auth.users`, table créée par GoTrue à son premier démarrage. Il faut donc que la
# stack tourne et que le service d'authentification soit sain avant de les appliquer.
#
# Les quatre fichiers sont idempotents : relancer ce script est sans danger.

$ErrorActionPreference = 'Stop'
$compose = Join-Path $PSScriptRoot 'docker-compose.yml'

$authState = (docker inspect --format '{{.State.Health.Status}}' vs-auth 2>$null)
if ($authState -ne 'healthy') {
  Write-Error "vs-auth n'est pas sain (état : $authState). La table auth.users n'existe peut-être pas encore."
}

$migrations = Get-ChildItem (Join-Path $PSScriptRoot '..\..\supabase\migrations') -Filter '*.sql' |
  Sort-Object Name

foreach ($migration in $migrations) {
  Write-Output "→ $($migration.Name)"
  docker compose -f $compose exec -T db `
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f "/game-migrations/$($migration.Name)"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Échec de $($migration.Name)."
  }
}

Write-Output ''
Write-Output 'Tables présentes :'
docker compose -f $compose exec -T db `
  psql -U postgres -d postgres -At -c "select tablename from pg_tables where schemaname='public' order by tablename"
