import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CB Nest — Smarter Estate Living";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "84px",
          background: "linear-gradient(135deg, #080808 0%, #17130b 100%)",
          color: "#ffffff",
          fontFamily: "Arial",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#f4a81d", fontSize: 38, fontWeight: 800 }}>
          <div style={{ width: 54, height: 54, border: "3px solid #f4a81d", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>⌂</div>
          <span>CB NEST</span>
        </div>
        <div style={{ marginTop: 54, fontSize: 68, lineHeight: 1.08, fontWeight: 800, maxWidth: 980 }}>
          Smarter Estate Living.
        </div>
        <div style={{ marginTop: 24, fontSize: 30, color: "#dedede", maxWidth: 900 }}>
          One connected platform for residents, security, events and estate management.
        </div>
        <div style={{ marginTop: 54, width: 150, height: 8, borderRadius: 8, background: "#f4a81d" }} />
      </div>
    ),
    { ...size },
  );
}
