import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/env.ts is a server-only module and must never be imported in client code.",
  );
}

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required.")
    .refine(
      (val) => val.startsWith("postgresql://") || val.startsWith("postgres://"),
      {
        message:
          "DATABASE_URL must be a valid PostgreSQL URL starting with postgresql:// or postgres://.",
      },
    ),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof envSchema>;

function parseServerEnv(): ServerEnv {
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid or missing environment variables:\n${details}\nCheck your .env file against .env.example.`,
    );
  }

  return parsed.data;
}

export const env: ServerEnv = parseServerEnv();
