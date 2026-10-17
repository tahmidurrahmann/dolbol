import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fontPath = join(
    process.cwd(),
    "src",
    "assets",
    "fonts",
    "NotoSansBengali-Regular.ttf",
  );
  const notoSansBengaliData = await readFile(fontPath);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#ffffff",
        color: "#111c16",
        padding: "32px",
        fontFamily: '"Noto Sans Bengali", sans-serif',
        fontSize: 28,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "flex",
          fontWeight: 700,
          marginBottom: "12px",
          color: "#0f6b4a",
        }}
      >
        সুন্দরবন ভ্রমণ — মোট খরচ ৳১২,৫০০
      </div>
      <div style={{ display: "flex", marginBottom: "8px" }}>
        কক্সবাজার • শ্রীমঙ্গল • দ্বিতীয় দিন
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: "#4a5d52",
          marginTop: "12px",
        }}
      >
        Sundarbans Trip — Total Cost ৳12,500
      </div>
    </div>,
    {
      width: 600,
      height: 300,
      fonts: [
        {
          name: "Noto Sans Bengali",
          data: notoSansBengaliData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
