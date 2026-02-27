import { useEffect } from "react";

type LegalPage = "rules" | "impressum" | "datenschutz" | "agb";

interface LegalModalProps {
  page: LegalPage | null;
  onClose: () => void;
}

const env = {
  name: "Alaettin Dogan",
  address: "c/o Online-Impressum #6686\nEuroparing 90\n53757 Sankt Augustin",
  email: "iota.place@gmail.com",
  domain: "iota-place.com",
};

const TITLES: Record<LegalPage, string> = {
  rules: "Rules",
  impressum: "Legal Notice",
  datenschutz: "Privacy Policy",
  agb: "Terms of Service",
};

const h3Style: React.CSSProperties = { margin: "24px 0 12px", color: "#0f172a" };
const h3FirstStyle: React.CSSProperties = { margin: "0 0 16px", color: "#0f172a" };

function RulesContent() {
  return (
    <div>
      <h3 style={h3FirstStyle}>How it works</h3>
      <p>
        IOTA Place is a shared pixel canvas. Anyone with an IOTA wallet can place pixels.
        Each pixel costs IOTA tokens — the price increases with each overwrite.
      </p>

      <h3 style={h3Style}>Pricing</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>First placement on an empty pixel: <strong>0.2 IOTA</strong></li>
        <li>Each overwrite costs <strong>20% more</strong> than the previous price</li>
      </ul>

      <h3 style={h3Style}>Content Rules</h3>
      <p>The following content is prohibited:</p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>Pornographic, sexually explicit, or NSFW content</li>
        <li>Hate symbols, racist, discriminatory, or extremist imagery</li>
        <li>Political propaganda or extremist messaging</li>
        <li>Personal data of others (doxxing)</li>
      </ul>
      <p>
        Violations may result in wallet bans and pixel resets.
      </p>

      <h3 style={h3Style}>Good to know</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>All pixel placements are final — spent IOTA will not be refunded</li>
        <li>The canvas may be reset at the end of a season</li>
        <li>The operator may remove content at any time without notice</li>
      </ul>
    </div>
  );
}

function ImpressumContent() {
  return (
    <div>
      <h3 style={h3FirstStyle}>Information pursuant to § 5 TMG</h3>
      <p><strong>{env.domain} - {env.name}</strong></p>
      {env.address.split("\n").map((line, i) => <p key={i} style={{ margin: "2px 0" }}>{line}</p>)}

      <h3 style={h3Style}>Contact</h3>
      <p>Email: {env.email}</p>

      <h3 style={h3Style}>Liability for Content</h3>
      <p>
        As a service provider, we are responsible for our own content on these pages in accordance
        with general legislation pursuant to § 7 (1) TMG. However, pursuant to §§ 8 to 10 TMG,
        we are not obligated to monitor transmitted or stored third-party information or to
        investigate circumstances that indicate illegal activity.
      </p>

      <h3 style={h3Style}>Liability for Links</h3>
      <p>
        Our website may contain links to external third-party websites over whose content we have
        no influence. Therefore, we cannot accept any liability for this third-party content.
      </p>
    </div>
  );
}

function DatenschutzContent() {
  return (
    <div>
      <h3 style={h3FirstStyle}>1. Data Controller</h3>
      <p>
        <strong>{env.domain} - {env.name}</strong><br />
        {env.address.split("\n").map((line, i) => <span key={i}>{line}<br /></span>)}
        Email: {env.email}
      </p>

      <h3 style={h3Style}>2. Data Collected</h3>
      <p>When using IOTA Place, the following data is processed:</p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li><strong>IP address</strong> — technically required for server requests (server logs)</li>
        <li><strong>Wallet address</strong> — when connecting a wallet</li>
        <li><strong>Pixel placements</strong> — coordinates, color, timestamp, associated wallet address</li>
        <li><strong>WebSocket connection</strong> — for real-time updates (Socket.io)</li>
      </ul>

      <h3 style={h3Style}>3. Legal Basis</h3>
      <p>
        Data processing is based on Art. 6(1)(f) GDPR (legitimate interest).
        The legitimate interest lies in providing and operating the application.
      </p>

      <h3 style={h3Style}>4. Local Storage</h3>
      <p>
        IOTA Place uses the browser's localStorage for technical purposes:
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>Wallet connection data (automatic reconnection)</li>
        <li>Cookie consent status</li>
      </ul>
      <p>
        <strong>No cookies are set.</strong> No tracking or analytics tools are used.
      </p>

      <h3 style={h3Style}>5. Blockchain Notice</h3>
      <p>
        When using IOTA payment mode, transactions are executed on the IOTA blockchain.
        Blockchain transactions are publicly visible and cannot be technically deleted or
        modified. Your wallet address and transaction details are permanently stored on the IOTA network.
      </p>

      <h3 style={h3Style}>6. Your Rights</h3>
      <p>You have the right to:</p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>Access your stored data (Art. 15 GDPR)</li>
        <li>Rectification of inaccurate data (Art. 16 GDPR)</li>
        <li>Erasure of your data (Art. 17 GDPR), unless retention obligations apply</li>
        <li>Restriction of processing (Art. 18 GDPR)</li>
        <li>Object to processing (Art. 21 GDPR)</li>
        <li>Lodge a complaint with a supervisory authority (Art. 77 GDPR)</li>
      </ul>
      <p>
        <strong>Note:</strong> Data stored on the IOTA blockchain cannot be deleted,
        as this is technically not possible.
      </p>

      <h3 style={h3Style}>7. Contact</h3>
      <p>
        For privacy-related questions, contact us at: {env.email}
      </p>
    </div>
  );
}

function AGBContent() {
  return (
    <div>
      <h3 style={h3FirstStyle}>1. Scope</h3>
      <p>
        These terms of service apply to the use of the web application IOTA Place,
        operated by {env.name}.
      </p>

      <h3 style={h3Style}>2. Description of Service</h3>
      <p>
        IOTA Place is a collaborative pixel canvas application. Users can place individual pixels on a
        shared canvas. Placing a pixel requires payment in IOTA tokens or test credits (mock mode).
        The price of a pixel increases with each overwrite.
      </p>

      <h3 style={h3Style}>3. Usage Rules</h3>
      <p>The following content and actions are prohibited:</p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
        <li>Pornographic, sexually explicit, or otherwise NSFW content</li>
        <li>Hate symbols, racist, discriminatory, or extremist imagery</li>
        <li>Political propaganda or extremist messaging</li>
        <li>Personal data of others (doxxing, addresses, phone numbers)</li>
      </ul>
      <p>
        Violations may result in the wallet being banned and affected pixels being reset.
        The operator reserves the right to remove content at any time without prior notice.
      </p>

      <h3 style={h3Style}>4. Disclaimer</h3>
      <p>
        IOTA Place is provided as a beta version. No guarantees are made regarding
        availability, correctness, or preservation of placed pixels.
        IOTA tokens already spent will not be refunded, particularly not after
        canvas resets at the end of a season.
      </p>

      <h3 style={h3Style}>5. Changes to Terms</h3>
      <p>
        We reserve the right to modify these terms of service at any time. The current
        version is always accessible through the application. Continued use after changes
        constitutes acceptance.
      </p>

      <h3 style={h3Style}>6. Governing Law</h3>
      <p>
        The laws of the Federal Republic of Germany shall apply.
      </p>
    </div>
  );
}

const CONTENT: Record<LegalPage, () => JSX.Element> = {
  rules: RulesContent,
  impressum: ImpressumContent,
  datenschutz: DatenschutzContent,
  agb: AGBContent,
};

export default function LegalModal({ page, onClose }: LegalModalProps) {
  // Close on ESC
  useEffect(() => {
    if (!page) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [page, onClose]);

  if (!page) return null;

  const Content = CONTENT[page];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 400,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          backdropFilter: "blur(20px)",
          borderRadius: 14,
          maxWidth: 700,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "32px 36px",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 22,
            color: "#94a3b8",
            cursor: "pointer",
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        {/* Title */}
        <h2 style={{ margin: "0 0 24px", fontSize: 22, color: "#0f172a", fontWeight: 700 }}>
          {TITLES[page]}
        </h2>

        {/* Content */}
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#64748b" }}>
          <Content />
        </div>
      </div>
    </div>
  );
}
