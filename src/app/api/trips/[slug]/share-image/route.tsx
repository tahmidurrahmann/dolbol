import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPublicTripSummary } from "@/lib/share-and-export";

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

  const fontPath = join(
    process.cwd(),
    "src",
    "assets",
    "fonts",
    "NotoSansBengali-Regular.ttf",
  );
  const notoSansBengaliData = await readFile(fontPath);

  const destinationText =
    summary.destination ?? summary.topVotedDestination ?? "বাংলাদেশ";
  const memberNamesPreview = summary.members
    .slice(0, 8)
    .map((m) => m.displayName)
    .join(" • ");

  const firstItineraryItems = summary.itineraryDays
    .flatMap((d) =>
      d.items.map((item) => `দিন ${d.dayNumber}: ${item.title}`),
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
          fontFamily: '"Noto Sans Bengali", sans-serif',
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
              <span
                style={{
                  fontSize: 22,
                  color: "#0f6b4a",
                  fontWeight: 700,
                }}
              >
                ট্রিপ হাব • Trip Hub
              </span>
              {summary.dateRangeLabel ? (
                <span style={{ fontSize: 20, color: "#4a5d52" }}>
                  {summary.dateRangeLabel}
                </span>
              ) : null}
            </div>

            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "#111c16",
                marginBottom: "10px",
              }}
            >
              {summary.name}
            </div>

            <div
              style={{
                fontSize: 28,
                color: "#0f6b4a",
                fontWeight: 700,
              }}
            >
              গন্তব্য: {destinationText}
            </div>
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
                    fontSize: 22,
                    color: "#111c16",
                  }}
                >
                  • {line}
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
            <div style={{ fontSize: 20, color: "#4a5d52", marginBottom: "6px" }}>
              ভ্রমণসঙ্গী ({summary.memberCount}):
            </div>
            <div
              style={{
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
