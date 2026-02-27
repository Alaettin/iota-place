import { Pixel, COLOR_PALETTE } from "../types";

interface PixelInfoProps {
  pixel: Pixel | null;
  nextPrice: number | null;
  hoverCoords: { x: number; y: number } | null;
}

export default function PixelInfo({ pixel, nextPrice, hoverCoords }: PixelInfoProps) {
  if (!hoverCoords) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        background: "rgba(0,0,0,0.85)",
        padding: 14,
        borderRadius: 10,
        minWidth: 200,
        fontSize: 13,
        color: "#ccc",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "#fff" }}>
        Pixel ({hoverCoords.x}, {hoverCoords.y})
      </div>

      {pixel && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 18,
                height: 18,
                background: COLOR_PALETTE[pixel.color],
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 3,
              }}
            />
            <span>{COLOR_PALETTE[pixel.color]}</span>
          </div>

          {pixel.walletId && (
            <div style={{ marginBottom: 4 }}>
              Owner: <span style={{ color: "#aaa" }}>{pixel.walletId.slice(0, 12)}...</span>
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            Overwrites: <span style={{ color: "#fff" }}>{pixel.overwriteCount}</span>
          </div>

          <div style={{ marginBottom: 4 }}>
            Last paid: <span style={{ color: "#FFD635" }}>{pixel.pricePaid.toFixed(4)} IOTA</span>
          </div>
        </>
      )}

      {nextPrice !== null && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          Next price: <span style={{ color: "#94E044", fontWeight: 700 }}>{nextPrice.toFixed(4)} IOTA</span>
        </div>
      )}
    </div>
  );
}
