import { ImageResponse } from "next/og"

export const alt = "Subcanvas: a whiteboard where every box opens"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// The link preview: the headline beside a stack of sheets.
export default function OpengraphImage() {
  const sheet = (offset: number) => ({
    position: "absolute" as const,
    left: 740 + offset,
    top: 170 + offset,
    width: 330,
    height: 250,
    borderRadius: 22,
    border: "3px solid #9ccbe8",
    background: "#ffffff",
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 90,
          background: "#f4f6fa",
          backgroundImage: "radial-gradient(#9ccbe8 2px, transparent 2px)",
          backgroundSize: "32px 32px",
          color: "#10162f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 600 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: "3px solid #10162f",
              background: "#ffffff",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: 5,
            }}
          >
            <div style={{ width: 20, height: 20, borderRadius: 5, background: "#2447f9" }} />
          </div>
          Subcanvas
        </div>
        <div style={{ marginTop: 44, width: 600, fontSize: 76, lineHeight: 1.02, fontWeight: 700, letterSpacing: -2 }}>
          A whiteboard where every box opens.
        </div>
        <div style={sheet(36)} />
        <div style={sheet(18)} />
        <div
          style={{
            ...sheet(0),
            border: "3px solid #10162f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            fontWeight: 600,
          }}
        >
          Open me
        </div>
      </div>
    ),
    size
  )
}
