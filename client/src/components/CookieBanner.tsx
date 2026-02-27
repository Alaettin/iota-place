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
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(0,0,0,0.1)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 300,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, color: "#4a5568", maxWidth: 500 }}>
        This website uses localStorage for technical purposes (wallet connection). No tracking cookies.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            background: "#1a1a2e",
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
            color: "#4a5568",
            border: "1px solid rgba(0,0,0,0.15)",
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
