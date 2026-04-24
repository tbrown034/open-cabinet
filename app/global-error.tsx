"use client";

import { useEffect } from "react";

// Catches errors thrown in the root layout itself.
// Renders its own <html> and <body> because the root layout has crashed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("GlobalError:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#fff",
          color: "#171717",
          margin: 0,
          padding: "8rem 1rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "1rem",
            }}
          >
            Open Cabinet is temporarily unavailable
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#737373", marginBottom: "1.5rem" }}>
            A fatal error occurred. Our logs have been notified.
          </p>
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: "#171717",
              color: "#fff",
              border: "none",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#a3a3a3",
                marginTop: "2rem",
                fontFamily: "monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
