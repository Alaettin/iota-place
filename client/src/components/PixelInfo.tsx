import { Pixel, COLOR_PALETTE } from "../types";

interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

interface ShieldInfo {
  walletId: string;
  expiresAt: string;
}

interface PixelInfoProps {
  pixel: Pixel | null;
  nextPrice: number | null;
  selectedPixel: { x: number; y: number } | null;
  selectedColor: number;
  wallet: WalletInfo | null;
  placing: boolean;
  shield: ShieldInfo | null;
  onPlacePixel: () => void;
  onDeselect: () => void;
}

export default function PixelInfo({
  pixel,
  nextPrice,
  selectedPixel,
  selectedColor,
  wallet,
  placing,
  shield,
  onPlacePixel,
  onDeselect,
}: PixelInfoProps) {
  if (!selectedPixel) return null;

  const canAfford = wallet && nextPrice !== null && wallet.balance >= nextPrice;
  const isShielded = !!shield;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 12,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        padding: 16,
        borderRadius: 12,
        minWidth: 220,
        fontSize: 13,
        color: "#4a5568",
        boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
        border: "1px solid rgba(0,0,0,0.08)",
        zIndex: 50,
      }}
    >
      {/* Header with close */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>
          Pixel ({selectedPixel.x}, {selectedPixel.y})
        </div>
        <button
          onClick={onDeselect}
          style={{
            background: "none",
            border: "none",
            color: "#a0aec0",
            fontSize: 16,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          x
        </button>
      </div>

      {/* Current pixel info */}
      {pixel && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 18,
                height: 18,
                background: COLOR_PALETTE[pixel.color],
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 3,
              }}
            />
            <span style={{ color: "#718096" }}>{COLOR_PALETTE[pixel.color]}</span>
          </div>

          {pixel.walletId && (
            <div style={{ marginBottom: 4 }}>
              Owner: <span style={{ color: "#4a5568" }}>{pixel.walletId.slice(0, 12)}...</span>
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            Overwrites: <span style={{ color: "#1a1a2e", fontWeight: 600 }}>{pixel.overwriteCount}</span>
          </div>

          <div style={{ marginBottom: 4 }}>
            Last paid: <span style={{ color: "#d97706", fontWeight: 600 }}>{pixel.pricePaid.toFixed(4)} IOTA</span>
          </div>
        </>
      )}

      {/* Shield indicator */}
      {isShielded && (
        <div
          style={{
            padding: "6px 10px",
            background: "rgba(6,182,212,0.1)",
            borderRadius: 6,
            fontSize: 12,
            color: "#0891b2",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Shielded until {new Date(shield.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Separator */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", margin: "10px 0" }} />

      {/* New color preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "#718096" }}>New color:</span>
        <div
          style={{
            width: 18,
            height: 18,
            background: COLOR_PALETTE[selectedColor],
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 3,
          }}
        />
        <span style={{ color: "#4a5568", fontSize: 12 }}>{COLOR_PALETTE[selectedColor]}</span>
      </div>

      {/* Price */}
      {nextPrice !== null && (
        <div style={{ marginBottom: 12, fontSize: 14 }}>
          Price: <span style={{ color: "#16a34a", fontWeight: 700 }}>{nextPrice.toFixed(4)} IOTA</span>
        </div>
      )}

      {/* Place button or wallet hint */}
      {!wallet ? (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(59,130,246,0.08)",
            borderRadius: 8,
            fontSize: 12,
            color: "#3b82f6",
            textAlign: "center",
          }}
        >
          Connect your wallet to place pixels
        </div>
      ) : (
        <button
          onClick={onPlacePixel}
          disabled={placing || !canAfford || isShielded}
          style={{
            width: "100%",
            padding: "10px 0",
            background: isShielded ? "#e2e8f0" : placing ? "#a0aec0" : canAfford ? "#3b82f6" : "#e2e8f0",
            color: isShielded ? "#a0aec0" : placing ? "#fff" : canAfford ? "#fff" : "#a0aec0",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: placing || !canAfford || isShielded ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {isShielded
            ? "Pixel is shielded"
            : placing
              ? "Placing..."
              : !canAfford
                ? "Insufficient balance"
                : `Place Pixel (${nextPrice?.toFixed(4) ?? "..."} IOTA)`}
        </button>
      )}
    </div>
  );
}
