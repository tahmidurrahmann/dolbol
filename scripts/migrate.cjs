const { execSync } = require("child_process");

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

if (dbUrl && !dbUrl.includes("placeholder")) {
  try {
    console.log("==> Applying database migrations to PostgreSQL...");
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("==> Migrations applied successfully.");
  } catch (err) {
    console.error("==> Warning: prisma migrate deploy failed:", err.message);
  }
} else {
  console.log("==> No valid DATABASE_URL provided. Skipping migration step.");
}
