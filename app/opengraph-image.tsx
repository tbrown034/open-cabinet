import { ImageResponse } from "next/og";
import { getOfficialsIndex } from "@/lib/data";

export const alt = "Open Cabinet — Executive Branch Stock Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const index = await getOfficialsIndex();
  const officialsCount = index.officials.length;
  const txCount = index.officials.reduce(
    (sum, o) => sum + (o.transactionCount || 0),
    0
  );

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
            marginBottom: 60,
          }}
        />
        <div
          style={{
            fontSize: 28,
            color: "#737373",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontFamily: "sans-serif",
            marginBottom: 28,
          }}
        >
          Open Cabinet
        </div>
        <div
          style={{
            fontSize: 88,
            color: "#171717",
            lineHeight: 1.05,
            fontWeight: 400,
            marginBottom: 36,
            letterSpacing: -2,
          }}
        >
          The first executive branch stock tracker
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
              {officialsCount}
            </span>
            <span
              style={{
                fontSize: 18,
                color: "#737373",
                textTransform: "uppercase",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              Officials
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 56, color: "#171717", fontWeight: 600 }}>
              {txCount.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: 18,
                color: "#737373",
                textTransform: "uppercase",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              Transactions
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: "auto",
              alignItems: "flex-end",
            }}
          >
            <span style={{ fontSize: 22, color: "#525252" }}>
              Data from U.S. Office of Government Ethics
            </span>
            <span style={{ fontSize: 18, color: "#a3a3a3", marginTop: 8 }}>
              open-cabinet.org
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
