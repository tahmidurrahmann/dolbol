#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="trip-hub"
SCHEMA_SOURCE="${SCHEMA_SOURCE:-./schema.prisma}"

echo "==> Creating Trip Hub Step 1 directory structure in ./${PROJECT_DIR} ..."
mkdir -p \
  "${PROJECT_DIR}/prisma" \
  "${PROJECT_DIR}/docs" \
  "${PROJECT_DIR}/src/app/api/health" \
  "${PROJECT_DIR}/src/app/api/dev/render-image" \
  "${PROJECT_DIR}/src/app/dev/render-test" \
  "${PROJECT_DIR}/src/components" \
  "${PROJECT_DIR}/src/i18n" \
  "${PROJECT_DIR}/src/lib/__tests__" \
  "${PROJECT_DIR}/src/messages" \
  "${PROJECT_DIR}/src/assets/fonts"

echo "==> Writing configuration files ..."

cat > "${PROJECT_DIR}/package.json" <<'EOF'
{
  "name": "trip-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.19.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  }
}
EOF

cat > "${PROJECT_DIR}/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
EOF

cat > "${PROJECT_DIR}/next.config.ts" <<'EOF'
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
EOF

cat > "${PROJECT_DIR}/postcss.config.mjs" <<'EOF'
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
EOF

cat > "${PROJECT_DIR}/eslint.config.mjs" <<'EOF'
import nextConfig from "eslint-config-next";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "coverage/**",
    ],
  },
  ...nextConfig,
  eslintConfigPrettier,
];

export default eslintConfig;
EOF

cat > "${PROJECT_DIR}/.prettierrc.json" <<'EOF'
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "useTabs": false,
  "trailingComma": "all",
  "printWidth": 80,
  "endOfLine": "lf"
}
EOF

cat > "${PROJECT_DIR}/.prettierignore" <<'EOF'
node_modules
.next
src/generated
prisma/migrations
pnpm-lock.yaml
EOF

cat > "${PROJECT_DIR}/.editorconfig" <<'EOF'
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
EOF

cat > "${PROJECT_DIR}/.gitignore" <<'EOF'
# Dependencies
/node_modules

# Next.js build output
/.next/
/out/

# Generated Prisma Client (Prisma 7 custom output)
/src/generated/

# Environment variables (secrets never committed)
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs & OS artifacts
npm-debug.log*
pnpm-debug.log*
.DS_Store
*.tsbuildinfo
next-env.d.ts
/coverage
EOF

cat > "${PROJECT_DIR}/.env.example" <<'EOF'
# PostgreSQL container credentials (used by docker-compose.yml)
POSTGRES_USER=triphub
POSTGRES_PASSWORD=triphub_dev_password
POSTGRES_DB=triphub
POSTGRES_PORT=5432

# Prisma & application database connection string
DATABASE_URL="postgresql://triphub:triphub_dev_password@localhost:5432/triphub?schema=public"

# Runtime environment ("development" | "test" | "production")
NODE_ENV="development"
EOF

if [ ! -f "${PROJECT_DIR}/.env" ]; then
  cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
  echo "==> Created ${PROJECT_DIR}/.env from .env.example"
else
  echo "==> Preserved existing ${PROJECT_DIR}/.env (not overwritten)"
fi

cat > "${PROJECT_DIR}/docker-compose.yml" <<'EOF'
services:
  postgres:
    image: postgres:16
    container_name: trip-hub-postgres
    restart: unless-stopped
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-triphub}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-triphub_dev_password}
      POSTGRES_DB: ${POSTGRES_DB:-triphub}
    volumes:
      - trip_hub_pgdata:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U $${POSTGRES_USER:-triphub} -d $${POSTGRES_DB:-triphub}",
        ]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 5s

volumes:
  trip_hub_pgdata:
    name: trip_hub_pgdata
EOF

cat > "${PROJECT_DIR}/prisma.config.ts" <<'EOF'
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
EOF

cat > "${PROJECT_DIR}/prisma/schema.prisma" <<'EOF'
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
EOF

if [ -f "${SCHEMA_SOURCE}" ]; then
  echo "==> Merging enums and models from ${SCHEMA_SOURCE} into ${PROJECT_DIR}/prisma/schema.prisma ..."
  printf "\n" >> "${PROJECT_DIR}/prisma/schema.prisma"
  awk '
    /^[[:space:]]*(generator|datasource)[[:space:]]+[A-Za-z0-9_-]+[[:space:]]*\{/ {
      in_skip_block = 1
      brace_depth = 0
    }
    in_skip_block {
      line = $0
      open_count = gsub(/\{/, "{", line)
      close_count = gsub(/\}/, "}", line)
      brace_depth += open_count - close_count
      if (brace_depth <= 0) {
        in_skip_block = 0
      }
      next
    }
    { print }
  ' "${SCHEMA_SOURCE}" >> "${PROJECT_DIR}/prisma/schema.prisma"
else
  echo "==> NOTE: No external schema file found at ${SCHEMA_SOURCE}."
  echo "    Place your attached schema.prisma at ${SCHEMA_SOURCE} and re-run ./setup.sh,"
  echo "    or append its enum/model blocks below datasource db in ${PROJECT_DIR}/prisma/schema.prisma."
fi

cat > "${PROJECT_DIR}/vitest.config.ts" <<'EOF'
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});
EOF

FONT_PATH="${PROJECT_DIR}/src/assets/fonts/NotoSansBengali-Regular.ttf"
FONT_URL="https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf"
SYSTEM_FONT_FALLBACK="/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"

echo "==> Acquiring NotoSansBengali-Regular.ttf ..."
if curl -fsSL --connect-timeout 10 "${FONT_URL}" -o "${FONT_PATH}" 2>/dev/null; then
  echo "    Downloaded font from ${FONT_URL}"
elif [ -f "${SYSTEM_FONT_FALLBACK}" ]; then
  cp "${SYSTEM_FONT_FALLBACK}" "${FONT_PATH}"
  echo "    Network unavailable; copied system NotoSansBengali-Regular.ttf from ${SYSTEM_FONT_FALLBACK}"
else
  echo "ERROR: Failed to download NotoSansBengali-Regular.ttf from ${FONT_URL}" >&2
  exit 1
fi

echo "==> Verifying ${FONT_PATH} is a valid TrueType/OpenType font file ..."
FONT_SIZE=$(wc -c < "${FONT_PATH}" | tr -d ' ')
MAGIC_HEX=$(od -An -tx1 -N4 "${FONT_PATH}" | tr -d ' \n')

if [ "${FONT_SIZE}" -lt 50000 ]; then
  rm -f "${FONT_PATH}"
  echo "ERROR: Font check failed! ${FONT_PATH} is only ${FONT_SIZE} bytes (expected >= 50000 bytes; likely an HTML error page)." >&2
  exit 1
fi

case "${MAGIC_HEX}" in
  00010000|4f54544f|74727565)
    echo "    Font check PASSED: size=${FONT_SIZE} bytes, magic=0x${MAGIC_HEX} (valid TTF/OTF binary)"
    ;;
  *)
    rm -f "${FONT_PATH}"
    echo "ERROR: Font check failed! ${FONT_PATH} has invalid magic bytes 0x${MAGIC_HEX} (expected TrueType 0x00010000 or OpenType 0x4f54544f, not HTML)." >&2
    exit 1
    ;;
esac

echo "==> setup.sh completed successfully. Project created in ./${PROJECT_DIR}"
