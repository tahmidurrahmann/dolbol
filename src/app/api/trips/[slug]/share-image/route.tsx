import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { BRAND } from "@/config/brand";
import { db } from "@/lib/db";
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
    summary.destination ?? summary.topVotedDestination ?? "Bangladesh";
  const memberNamesPreview = summary.members
    .slice(0, 8)
    .map((m) => m.displayName)
    .join(" • ");

  const firstItineraryItems = summary.itineraryDays
    .flatMap((d) =>
      d.items.map((item) => `Day ${d.dayNumber}: ${item.title}`),
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
          backgroundColor: "#0f6b4a",
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
            borderRadius: "24px",
            padding: "44px 48px",
            color: "#111c16",
          }}
        >
          {/* Top Header */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 26,
                    color: "#0f6b4a",
                    fontWeight: 700,
                    letterSpacing: "-0.5px",
                  }}
                >
                  🌴 {BRAND.name.bn}
                </span>
                <span
                  style={{
                    display: "flex",
                    fontSize: 14,
                    color: "#0f6b4a",
                    fontWeight: 600,
                    backgroundColor: "#e8f5ee",
                    padding: "3px 10px",
                    borderRadius: "8px",
                    border: "1px solid #c2e5d3",
                  }}
                >
                  {getSiteUrl().host}
                </span>
              </div>
              {summary.dateRangeLabel ? (
                <span style={{ display: "flex", fontSize: 20, color: "#4a5d52" }}>
                  {summary.dateRangeLabel}
                </span>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 48,
                fontWeight: 700,
                color: "#111c16",
                marginBottom: "10px",
              }}
            >
              {summary.name}
            </div>

            {destinationText ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: "#0f6b4a",
                  fontWeight: 700,
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>📍</span>
                <span>{destinationText}</span>
              </div>
            ) : null}
          </div>

          {/* Middle Itinerary Preview (if any) */}
          {firstItineraryItems.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#eef3f0",
                borderRadius: "16px",
                padding: "20px 24px",
                gap: "6px",
              }}
            >
              {firstItineraryItems.map((line) => (
                <div
                  key={line}
                  style={{
                    display: "flex",
                    fontSize: 22,
                    color: "#111c16",
                  }}
                >
                  {`• ${line}`}
                </div>
              ))}
            </div>
          ) : null}

          {/* Bottom Members Bar */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: "2px solid #d5e0da",
              paddingTop: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: "#4a5d52",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              {`👥 Members (${summary.memberCount}):`}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                color: "#111c16",
              }}
            >
              {memberNamesPreview}
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
