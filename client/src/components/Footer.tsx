interface FooterProps {
  onLegalPage: (page: "impressum" | "datenschutz" | "agb") => void;
}

export default function Footer({ onLegalPage }: FooterProps) {
  const linkStyle: React.CSSProperties = {
    color: "#718096",
    textDecoration: "none",
    cursor: "pointer",
    padding: "2px 0",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 11,
        zIndex: 10,
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(4px)",
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <span style={linkStyle} onClick={() => onLegalPage("impressum")}>Legal Notice</span>
      <span style={{ color: "#cbd5e0" }}>|</span>
      <span style={linkStyle} onClick={() => onLegalPage("datenschutz")}>Privacy</span>
      <span style={{ color: "#cbd5e0" }}>|</span>
      <span style={linkStyle} onClick={() => onLegalPage("agb")}>Terms</span>
    </div>
  );
}
