interface CookieBannerProps {
  onAccept: () => void;
  onMoreInfo: () => void;
}

export default function CookieBanner({ onAccept, onMoreInfo }: CookieBannerProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid #e2e8f0",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 300,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, color: "#64748b", maxWidth: 500 }}>
        This website uses localStorage for technical purposes (wallet connection). No tracking cookies.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Accept
        </button>
        <button
          onClick={onMoreInfo}
          style={{
            background: "transparent",
            color: "#64748b",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Learn more
        </button>
      </div>
    </div>
  );
}
