# Step 1 — Manual Acceptance Verification Checklist

Run through each check below in order and mark the checkbox when verified.

## 1. Default Locale & `<html lang>` Attribute

- [x] Clear cookies for `http://localhost:3000` (DevTools -> Application -> Cookies -> Clear) and reload `http://localhost:3000` with `pnpm dev` running.
- [x] Verify the page renders in **Bangla** by default (`ট্রিপ হাব`, `নতুন ট্রিপ তৈরি করুন`, `ট্রিপে যোগ দিন`) even if your browser's `Accept-Language` header prefers `en-US`.
- [x] Inspect the root element in DevTools (`document.documentElement.lang`) or run `curl -s http://localhost:3000 | grep -o '<html[^>]*>'` and confirm `<html lang="bn" ...>`.

## 2. Header Language Toggle & Cookie Persistence

- [x] Click the header language toggle button (`English`) on the top right.
- [x] Verify the UI switches to **English** (`Trip Hub`, `Create a trip`, `Join a trip`), the toggle button label changes to `বাংলা`, and `<html lang="en" ...>` updates to `"en"`.
- [x] Verify the URL remains `http://localhost:3000/` with **no** `/en` or `/bn` path prefix.
- [x] Reload the page (`Cmd+R` / `Ctrl+R`) and verify English persists via the `trip_hub_locale=en` cookie.
- [x] Click the toggle button (`বাংলা`) again, reload the page, and verify Bangla (`trip_hub_locale=bn`) and `<html lang="bn" ...>` persist.

## 3. Health Endpoint (`/api/health`)

- [x] With PostgreSQL running (`docker compose up -d` or local PostgreSQL service), run: `curl -i http://localhost:3000/api/health` and confirm HTTP `200 OK` with body `{"ok":true}`.
- [x] Stop PostgreSQL and run: `curl -i http://localhost:3000/api/health` and confirm HTTP `503 Service Unavailable` with body `{"ok":false}` and zero leaked database stack traces or connection strings.
- [x] Start PostgreSQL again and confirm `/api/health` returns `200 OK` `{"ok":true}`.

## 4. Mobile-First Layout (360px & >768px)

- [x] In browser DevTools Device Toolbar, set viewport width to **360px** (e.g., Galaxy S8 / 360x740). Verify there is no horizontal scrollbar, body text is at least `16px`, and the language toggle and action buttons are at least `44x44px`.
- [x] Resize viewport width above **768px** (e.g., `1280px` desktop). Verify the app stays a single centered column constrained to `max-w-[480px]` (`480px` max width) with no separate multi-column tablet/desktop layout.

## 5. Dev-Only Bangla Rendering Routes & Production 404 Gate

- [x] In development (`pnpm dev`), open `http://localhost:3000/dev/render-test` and `http://localhost:3000/api/dev/render-image` and complete `docs/bangla-render-check.md`.
- [x] Stop `pnpm dev`, build and start the production server (`pnpm build && pnpm start`), and test both dev routes:
  - [x] `curl -I http://localhost:3000/dev/render-test` returns HTTP `404`.
  - [x] `curl -I http://localhost:3000/api/dev/render-image` returns HTTP `404`.
