import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { BRAND, DOLBOL_LOGO_DATA_URI } from "@/config/brand";
import { db } from "@/lib/db";
import { toBanglaDigits } from "@/lib/format";
import { buildPublicTripSummary } from "@/lib/share-and-export";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const isDownload = searchParams.get("download") === "1";

  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
      options: {
        orderBy: { createdAt: "asc" },
      },
      votes: true,
      itinerary: {
        orderBy: [
          { dayNumber: "asc" },
          { position: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!trip) {
    return new NextResponse("Trip Not Found", { status: 404 });
  }

  const summary = buildPublicTripSummary({
    slug: trip.slug,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    members: trip.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      emoji: m.emoji,
      isGuest: m.isGuest,
    })),
    options: trip.options,
    votes: trip.votes,
    itinerary: trip.itinerary,
    locale: "bn",
  });

  let notoSansBengaliData: Buffer | null = null;
  const candidateFontPaths = [
    join(process.cwd(), "public", "fonts", "NotoSansBengali-Regular.ttf"),
    join(process.cwd(), "src", "assets", "fonts", "NotoSansBengali-Regular.ttf"),
  ];

  for (const fontPath of candidateFontPaths) {
    try {
      notoSansBengaliData = await readFile(/*turbopackIgnore: true*/ fontPath);
      if (notoSansBengaliData) break;
    } catch {
      // Continue to next candidate path
    }
  }

  const destinationText =
    summary.destination ?? summary.topVotedDestination ?? "বাংলাদেশ";

  // Clean, Satori-safe numeric date format to prevent broken Bengali conjuncts
  let safeDateLabel: string | null = null;
  if (trip.startDate && trip.endDate) {
    const sD = new Date(trip.startDate);
    const eD = new Date(trip.endDate);
    safeDateLabel = `${toBanglaDigits(sD.getDate())}/${toBanglaDigits(sD.getMonth() + 1)}/${toBanglaDigits(sD.getFullYear())} — ${toBanglaDigits(eD.getDate())}/${toBanglaDigits(eD.getMonth() + 1)}/${toBanglaDigits(eD.getFullYear())}`;
  } else if (trip.startDate) {
    const sD = new Date(trip.startDate);
    safeDateLabel = `${toBanglaDigits(sD.getDate())}/${toBanglaDigits(sD.getMonth() + 1)}/${toBanglaDigits(sD.getFullYear())}`;
  } else if (trip.endDate) {
    const eD = new Date(trip.endDate);
    safeDateLabel = `${toBanglaDigits(eD.getDate())}/${toBanglaDigits(eD.getMonth() + 1)}/${toBanglaDigits(eD.getFullYear())}`;
  }

  const firstItineraryItems = summary.itineraryDays
    .flatMap((d) =>
      d.items.map((item) => `দিন ${toBanglaDigits(d.dayNumber)}: ${item.title}`),
    )
    .slice(0, 3);

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          backgroundColor: "#064e3b",
          padding: "36px",
          fontFamily: "Noto Sans Bengali, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            backgroundColor: "#ffffff",
            borderRadius: "32px",
            padding: "40px 48px",
            color: "#0f172a",
            border: "3px solid #10b981",
          }}
        >
          {/* Top Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DOLBOL_LOGO_DATA_URI}
                  alt={BRAND.name.bn}
                  width={34}
                  height={34}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                  }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 28,
                    color: "#065f46",
                    fontWeight: 800,
                  }}
                >
                  {BRAND.name.bn}
                </span>
              </div>
              <span
                style={{
                  display: "flex",
                  fontSize: 15,
                  color: "#065f46",
                  fontWeight: 700,
                  backgroundColor: "#ecfdf5",
                  padding: "4px 12px",
                  borderRadius: "10px",
                  border: "1.5px solid #a7f3d0",
                }}
              >
                {getSiteUrl().host}
              </span>
            </div>
            {safeDateLabel ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#166534",
                  backgroundColor: "#f0fdf4",
                  border: "1.5px solid #bbf7d0",
                  padding: "6px 16px",
                  borderRadius: "12px",
                }}
              >
                {`🗓️ ${safeDateLabel}`}
              </div>
            ) : null}
          </div>

          {/* Trip Title & Highlights Row */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {summary.name}
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: 19,
                  color: "#065f46",
                  fontWeight: 700,
                  backgroundColor: "#ecfdf5",
                  padding: "6px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid #6ee7b7",
                }}
              >
                {`📍 ${destinationText}`}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: 18,
                  color: "#1e40af",
                  fontWeight: 700,
                  backgroundColor: "#eff6ff",
                  padding: "6px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid #bfdbfe",
                }}
              >
                {`👥 ${toBanglaDigits(summary.memberCount)} জন ভ্রমণসঙ্গী`}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: 18,
                  color: "#92400e",
                  fontWeight: 700,
                  backgroundColor: "#fef3c7",
                  padding: "6px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid #fde68a",
                }}
              >
                🎒 গ্রুপ ট্রিপ
              </span>
            </div>
          </div>

          {/* Middle Itinerary Preview or Branded Travel Banner */}
          {firstItineraryItems.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#f8fafc",
                border: "1.5px solid #e2e8f0",
                borderRadius: "18px",
                padding: "18px 24px",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#059669",
                  marginBottom: "2px",
                }}
              >
                🗺️ ভ্রমণ পরিকল্পনা:
              </div>
              {firstItineraryItems.map((line) => (
                <div
                  key={line}
                  style={{
                    display: "flex",
                    fontSize: 20,
                    fontWeight: 600,
                    color: "#1e293b",
                  }}
                >
                  {`• ${line}`}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f0fdf4",
                borderRadius: "20px",
                border: "2px dashed #86efac",
                padding: "22px 28px",
                gap: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#166534",
                  gap: "8px",
                }}
              >
                <span>✨</span>
                <span>{BRAND.tagline.bn}</span>
              </div>
              <div style={{ display: "flex", fontSize: 17, color: "#4b5563" }}>
                বন্ধুদের সাথে সুন্দর মুহূর্ত ও খরচের হিসাব
              </div>
            </div>
          )}

          {/* Bottom Members Bar with Individual Emoji Chips */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: "2px solid #e2e8f0",
              paddingTop: "16px",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 17,
                fontWeight: 700,
                color: "#475569",
              }}
            >
              {`👥 ভ্রমণসঙ্গী (${toBanglaDigits(summary.memberCount)} জন):`}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {summary.members.slice(0, 8).map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#f8fafc",
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "6px 14px",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1e293b",
                  }}
                >
                  <span>{m.emoji}</span>
                  <span>{m.displayName}</span>
                </div>
              ))}
              {summary.members.length > 8 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "#f1f5f9",
                    borderRadius: "12px",
                    padding: "6px 14px",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#059669",
                  }}
                >
                  {`+${toBanglaDigits(summary.members.length - 8)} জন`}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: notoSansBengaliData
        ? [
            {
              name: "Noto Sans Bengali",
              data: notoSansBengaliData,
              style: "normal",
              weight: 400,
            },
            {
              name: "Noto Sans Bengali",
              data: notoSansBengaliData,
              style: "normal",
              weight: 600,
            },
            {
              name: "Noto Sans Bengali",
              data: notoSansBengaliData,
              style: "normal",
              weight: 700,
            },
          ]
        : [],
    },
  );

  if (isDownload) {
    const buffer = await imageResponse.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="trip-summary-${trip.slug}.png"`,
      },
    });
  }

  return imageResponse;
}
