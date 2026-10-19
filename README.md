# Dolbol (Step 1 — Foundation)

Mobile-first group trip planner and expense splitter for friend groups in Bangladesh.
Currency is whole BDT (`৳`) only, time zone is pinned to `Asia/Dhaka`, and the UI defaults to Bangla (`bn`) with an English (`en`) cookie toggle.

## Prerequisites

- **Node.js**: `>= 20.19.0` (LTS)
- **Package Manager**: `pnpm`
- **Database**: PostgreSQL 16 (via Docker Compose or local PostgreSQL service)

## Setup Steps

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Acquire the local Bangla TTF font for `/api/dev/render-image`:**
   `NotoSansBengali-Regular.ttf` is sourced from the official [Google Noto Fonts repository](https://github.com/notofonts/noto-fonts) under the **SIL Open Font License 1.1 (OFL-1.1)**:

   ```bash
   curl -fsSL \
     "https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf" \
     -o src/assets/fonts/NotoSansBengali-Regular.ttf
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

4. **Start PostgreSQL 16 in Docker Compose:**

   ```bash
   docker compose up -d
   ```

5. **Run database migrations and generate the Prisma 7 client:**
   ```bash
   pnpm db:migrate --name init
   pnpm db:generate
   ```

## How to Run

- **Development server:**

  ```bash
  pnpm dev
  ```

  Open `http://localhost:3000` (and `http://localhost:3000/dev/render-test` for the dev-only Bangla rendering comparison).

- **Production build & start:**
  ```bash
  pnpm build
  pnpm start
  ```

## How to Run Tests & Checks

- **Unit tests (Vitest):**

  ```bash
  pnpm test
  ```

- **TypeScript check:**

  ```bash
  pnpm typecheck
  ```

- **ESLint:**
  ```bash
  pnpm lint
  ```
