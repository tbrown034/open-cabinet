import { ImageResponse } from "next/og";
import { getOfficialBySlug, getAllOfficialSlugs } from "@/lib/data";
import { displayName } from "@/lib/format";
import type { Transaction } from "@/lib/types";

export const alt = "Open Cabinet — Official financial trades";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const slugs = await getAllOfficialSlugs();
  if (!slugs.includes(slug)) return [];
  return [{ id: "default", alt, contentType, size }];
}

function isSale(type: Transaction["type"]) {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function OfficialOGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const official = await getOfficialBySlug(slug);
  if (!official) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            color: "#171717",
          }}
        >
          Open Cabinet
        </div>
      ),
      { ...size }
    );
  }

  const buys = official.transactions.filter((t) => t.type === "Purchase").length;
  const sells = official.transactions.filter((t) => isSale(t.type)).length;
  const lateFilings = official.transactions.filter((t) => t.lateFilingFlag).length;
  const total = official.transactions.length;
  const fullName = displayName(official.name);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          padding: "70px 80px",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            height: "6px",
            background: "#171717",
            width: "100%",
            marginBottom: 50,
          }}
        />
        <div
          style={{
            fontSize: 22,
            color: "#737373",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontFamily: "sans-serif",
            marginBottom: 24,
          }}
        >
          Open Cabinet · Official Trades
        </div>
        <div
          style={{
            fontSize: 92,
            color: "#171717",
            lineHeight: 1,
            fontWeight: 400,
            marginBottom: 18,
            letterSpacing: -2,
          }}
        >
          {fullName}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#525252",
            fontFamily: "sans-serif",
            marginBottom: 40,
          }}
        >
          {`${official.title} · ${official.agency}`}
        </div>
        <div
          style={{
            display: "flex",
            gap: 56,
            marginTop: "auto",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, color: "#171717", fontWeight: 600 }}>
              {total}
            </span>
            <span
              style={{
                fontSize: 16,
                color: "#737373",
                textTransform: "uppercase",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              Trades
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, color: "#b91c1c", fontWeight: 600 }}>
              {sells}
            </span>
            <span
              style={{
                fontSize: 16,
                color: "#737373",
                textTransform: "uppercase",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              Sales
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, color: "#047857", fontWeight: 600 }}>
              {buys}
            </span>
            <span
              style={{
                fontSize: 16,
                color: "#737373",
                textTransform: "uppercase",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              Purchases
            </span>
          </div>
          {lateFilings > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 56, color: "#b45309", fontWeight: 600 }}>
                {lateFilings}
              </span>
              <span
                style={{
                  fontSize: 16,
                  color: "#737373",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  marginTop: 4,
                }}
              >
                Late
              </span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: "auto",
              alignItems: "flex-end",
              justifyContent: "flex-end",
            }}
          >
            <span style={{ fontSize: 18, color: "#a3a3a3" }}>
              open-cabinet.org
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
