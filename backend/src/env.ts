function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Environment variable ${name} wajib diisi`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required("DATABASE_URL", "postgres://postgres@localhost:5432/undercover"),
  REDIS_URL: required("REDIS_URL", "redis://localhost:6379"),
  FRONTEND_ORIGIN: required("FRONTEND_ORIGIN", "http://localhost:3000"),
  INTERNAL_API_SECRET: required("INTERNAL_API_SECRET"),
  WS_JWT_SECRET: required("WS_JWT_SECRET"),
};
