import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:test@localhost:5432/test",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  },
}));

import RenderTestPage from "@/app/dev/render-test/page";
import DevExpenseDemoPage from "@/app/dev/expense-demo/page";
import { GET as renderImageGet } from "@/app/api/dev/render-image/route";

describe("Dev routes gating in production (NODE_ENV === 'production')", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it("/dev/render-test throws notFound in production", () => {
    expect(() => RenderTestPage()).toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("/dev/expense-demo throws notFound in production", async () => {
    await expect(
      DevExpenseDemoPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("/api/dev/render-image throws notFound or returns 404 in production", async () => {
    await expect(renderImageGet()).rejects.toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
