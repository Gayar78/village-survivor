# Valide la frontière de récompenses sur la vraie base LAN : droits, concurrence et idempotence.

$ErrorActionPreference = 'Stop'
$compose = Join-Path $PSScriptRoot 'docker-compose.yml'
$runId = [guid]::NewGuid().ToString()
$invalidRunId = [guid]::NewGuid().ToString()
$deniedRunId = [guid]::NewGuid().ToString()
$userOne = [guid]::NewGuid().ToString()
$userTwo = [guid]::NewGuid().ToString()

function Invoke-GameDatabaseSql {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $output = docker compose -f $compose exec -T db `
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Sql
  if ($LASTEXITCODE -ne 0) {
    throw 'La commande PostgreSQL de validation a échoué.'
  }
  return $output
}

try {
  Invoke-GameDatabaseSql -Sql @"
    insert into auth.users (id) values ('$userOne'::uuid), ('$userTwo'::uuid);
"@ | Out-Null

  $invalidRewards = '[{"user_id":"' + $userOne + '","amount":-1}]'
  $invalidSql = @"
    select set_config('request.jwt.claim.role', 'service_role', false);
    select public.finalize_game_run('$invalidRunId'::uuid, '$invalidRewards'::jsonb);
"@
  docker compose -f $compose exec -T db `
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $invalidSql 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    throw 'Une récompense négative a été acceptée.'
  }
  $invalidRows = Invoke-GameDatabaseSql -Sql "select count(*) from public.game_runs where id = '$invalidRunId'::uuid;"
  if ($invalidRows -ne '0') {
    throw 'La récompense invalide a produit une écriture partielle.'
  }

  $rewards = '[{"user_id":"' + $userOne + '","amount":37},{"user_id":"' + $userTwo + '","amount":5}]'
  $finalizeSql = @"
    select set_config('request.jwt.claim.role', 'service_role', false);
    select public.finalize_game_run('$runId'::uuid, '$rewards'::jsonb);
"@
  $jobs = 1..2 | ForEach-Object {
    Start-Job -ScriptBlock {
      param($ComposeFile, $Sql)
      docker compose -f $ComposeFile exec -T db `
        psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Sql
      if ($LASTEXITCODE -ne 0) { throw 'Finalisation concurrente en échec.' }
    } -ArgumentList $compose, $finalizeSql
  }
  $jobs | Wait-Job | Out-Null
  foreach ($job in $jobs) {
    Receive-Job -Job $job -ErrorAction Stop | Out-Null
    Remove-Job -Job $job
  }

  $result = Invoke-GameDatabaseSql -Sql @"
    select
      (select balance from public.account_gold_wallets where user_id = '$userOne'::uuid),
      (select balance from public.account_gold_wallets where user_id = '$userTwo'::uuid),
      (select count(*) from public.game_run_rewards where run_id = '$runId'::uuid),
      (select status from public.game_runs where id = '$runId'::uuid);
"@
  if ($result -ne '37|5|2|finished') {
    throw "Résultat de finalisation inattendu : $result"
  }

  $grants = Invoke-GameDatabaseSql -Sql @"
    select
      has_function_privilege('authenticated', 'public.finalize_game_run(uuid,jsonb)', 'execute'),
      has_function_privilege('service_role', 'public.finalize_game_run(uuid,jsonb)', 'execute'),
      has_function_privilege('authenticated', 'public.credit_account_gold(bigint)', 'execute');
"@
  if ($grants -ne 'f|t|f') {
    throw "Droits RPC inattendus : $grants"
  }

  $deniedSql = @"
    set role authenticated;
    select set_config('request.jwt.claim.role', 'authenticated', false);
    select public.finalize_game_run('$deniedRunId'::uuid, '[]'::jsonb);
"@
  docker compose -f $compose exec -T db `
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $deniedSql 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    throw 'La RPC de finalisation est encore exécutable par authenticated.'
  }

  Write-Output 'Récompenses : concurrence, idempotence et droits validés.'
}
finally {
  Invoke-GameDatabaseSql -Sql @"
    delete from public.game_runs where id in ('$runId'::uuid, '$invalidRunId'::uuid, '$deniedRunId'::uuid);
    delete from auth.users where id in ('$userOne'::uuid, '$userTwo'::uuid);
"@ | Out-Null
}
