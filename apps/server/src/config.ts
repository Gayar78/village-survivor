export interface ServerConfig {
  port: number;
  jwtSecret: string;
  serviceRoleKey: string;
  postgrestUrl: string;
  appLogLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  otlpEndpoint?: string;
  environment: string;
}

function requireSecret(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length < 16)
    throw new Error(`${name} doit être configuré côté serveur.`);
  return value;
}

export function readServerConfig(): ServerConfig {
  const rawPort = process.env.PORT ?? '2567';
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PORT invalide.');
  const postgrestUrl = process.env.POSTGREST_URL;
  if (postgrestUrl === undefined || !/^https?:\/\//u.test(postgrestUrl)) {
    throw new Error('POSTGREST_URL doit être une URL HTTP(S).');
  }
  const rawLogLevel = process.env.APP_LOG_LEVEL ?? 'info';
  if (!['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(rawLogLevel))
    throw new Error('APP_LOG_LEVEL invalide.');
  const rawOtlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (rawOtlpEndpoint !== undefined && !/^https?:\/\//u.test(rawOtlpEndpoint))
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT doit être une URL HTTP(S).');
  return {
    port,
    jwtSecret: requireSecret('JWT_SECRET'),
    serviceRoleKey: requireSecret('SERVICE_ROLE_KEY'),
    postgrestUrl: postgrestUrl.replace(/\/$/u, ''),
    appLogLevel: rawLogLevel as ServerConfig['appLogLevel'],
    ...(rawOtlpEndpoint === undefined ? {} : { otlpEndpoint: rawOtlpEndpoint.replace(/\/$/u, '') }),
    environment:
      process.env.OTEL_RESOURCE_ATTRIBUTES?.match(
        /(?:^|,)deployment\.environment\.name=([^,]+)/u,
      )?.[1] ?? 'development',
  };
}
