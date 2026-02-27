import { useState, useEffect, useCallback } from "react";
import Canvas from "./components/Canvas";
import ColorPalette from "./components/ColorPalette";
import PixelInfo from "./components/PixelInfo";
import WalletPanel from "./components/WalletPanel";
import Leaderboard from "./components/Leaderboard";
import LegalModal from "./components/LegalPages";
import CookieBanner from "./components/CookieBanner";
import Footer from "./components/Footer";
import PowerUpShop from "./components/PowerUpShop";
import { fetchCanvasBinary, fetchConfig, apiRequest } from "./services/api";
import { useSocket, SeasonInfo } from "./hooks/useSocket";
import { useIotaPayment } from "./hooks/useIotaPayment";
import { Pixel } from "./types";

interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

function App() {
  const [colorData, setColorData] = useState<Uint8Array | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(250);
  const [canvasHeight, setCanvasHeight] = useState(250);
  const [selectedColor, setSelectedColor] = useState(5);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [pixelInfo, setPixelInfo] = useState<Pixel | null>(null);
  const [nextPrice, setNextPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"mock" | "iota">("mock");
  const [collectionAddress, setCollectionAddress] = useState<string>("");
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [legalPage, setLegalPage] = useState<"impressum" | "datenschutz" | "agb" | null>(null);
  const [showCookieBanner, setShowCookieBanner] = useState(
    () => localStorage.getItem("cookie-consent") !== "accepted"
  );
  const [showShop, setShowShop] = useState(false);
  const [shieldMode, setShieldMode] = useState<{ inventoryId: number } | null>(null);
  const [activeShields, setActiveShields] = useState<Array<{ x: number; y: number; expiresAt: string }>>([]);
  const [pixelShield, setPixelShield] = useState<{ walletId: string; expiresAt: string } | null>(null);

  // IOTA payment hook
  const { placePixel: iotaPlacePixel, signing } = useIotaPayment();

  // WebSocket for real-time pixel updates
  const handleRemotePixelUpdate = useCallback((x: number, y: number, color: number) => {
    setColorData((prev) => {
      if (!prev) return prev;
      const next = new Uint8Array(prev);
      next[y * canvasWidth + x] = color;
      return next;
    });
  }, [canvasWidth]);

  const handlePauseChange = useCallback((p: boolean) => setPaused(p), []);
  const handleSeasonChange = useCallback((s: SeasonInfo | null) => setSeason(s), []);
  const handleCanvasReset = useCallback(() => {
    // Reload canvas binary from server after admin reset
    fetchCanvasBinary().then((data) => setColorData(data));
  }, []);
  const handleCanvasResize = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
    // Reload canvas binary with new dimensions
    fetchCanvasBinary().then((data) => setColorData(data));
  }, []);
  const handleShieldUpdate = useCallback((x: number, y: number, expiresAt: string, active: boolean) => {
    setActiveShields((prev) => {
      if (active) {
        return [...prev.filter((s) => !(s.x === x && s.y === y)), { x, y, expiresAt }];
      }
      return prev.filter((s) => !(s.x === x && s.y === y));
    });
  }, []);
  const { userCount, connected } = useSocket({ onPixelUpdate: handleRemotePixelUpdate, onPauseChange: handlePauseChange, onSeasonChange: handleSeasonChange, onCanvasReset: handleCanvasReset, onCanvasResize: handleCanvasResize, onShieldUpdate: handleShieldUpdate });

  // Load canvas + config + active shields on mount
  useEffect(() => {
    Promise.all([fetchCanvasBinary(), fetchConfig(), apiRequest<{ shields: Array<{ x: number; y: number; expiresAt: string }> }>("/api/powerups/shields")])
      .then(([data, { config, season: initialSeason }, shieldsRes]) => {
        if (config.width) setCanvasWidth(config.width);
        if (config.height) setCanvasHeight(config.height);
        setColorData(data);
        setPaymentMode(config.paymentMode);
        if (config.collectionAddress) setCollectionAddress(config.collectionAddress);
        if ((config as any).paused) setPaused(true);
        if (initialSeason) setSeason(initialSeason);
        if (shieldsRes.ok) setActiveShields(shieldsRes.payload.shields);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ESC key deselects pixel + cancels shield mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPixel(null);
        setPixelInfo(null);
        setNextPrice(null);
        setPixelShield(null);
        setShieldMode(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle pixel hover (no-op, kept for Canvas interface)
  const handlePixelHover = useCallback((_x: number, _y: number) => {
    // Hover is now a no-op — selection happens on click
  }, []);

  // Handle pixel click — selects the pixel or activates shield
  const handlePixelClick = useCallback(
    async (x: number, y: number) => {
      // Shield activation mode: try to shield the clicked pixel
      if (shieldMode) {
        if (!wallet) return;
        setError(null);
        const { ok, payload } = await apiRequest<{ expiresAt: string; error?: string }>(
          "/api/powerups/activate",
          {
            method: "POST",
            body: JSON.stringify({ inventoryId: shieldMode.inventoryId, targetX: x, targetY: y }),
            headers: { "X-Wallet-Id": wallet.walletId },
          }
        );
        if (ok) {
          setActiveShields((prev) => [...prev, { x, y, expiresAt: payload.expiresAt }]);
          setShieldMode(null);
        } else {
          setError(payload.error || "Could not activate shield");
        }
        return;
      }

      setSelectedPixel({ x, y });
      setError(null);

      const { ok, payload } = await apiRequest<{ pixel: Pixel; nextPrice: number; shield: { walletId: string; expiresAt: string } | null }>(
        `/api/canvas/pixel/${x}/${y}`
      );
      if (ok) {
        setPixelInfo(payload.pixel);
        setNextPrice(payload.nextPrice);
        setPixelShield(payload.shield || null);
      }
    },
    [shieldMode, wallet]
  );

  // Handle placing a pixel (the actual payment + placement)
  const handlePlacePixel = useCallback(
    async () => {
      if (!selectedPixel || placing || signing || paused) return;
      setError(null);

      if (!wallet) {
        setError("Connect your wallet first!");
        return;
      }

      setPlacing(true);
      try {
        const { x, y } = selectedPixel;
        let txDigest: string | undefined;

        // In IOTA mode, build + sign transaction first
        if (paymentMode === "iota") {
          if (!collectionAddress) {
            setError("Collection address not configured");
            return;
          }
          if (nextPrice === null) {
            setError("Price not loaded");
            return;
          }

          const digest = await iotaPlacePixel({
            collectionAddress,
            amount: nextPrice,
            x,
            y,
            color: selectedColor,
          });

          if (!digest) {
            // User rejected or error (useIotaPayment sets its own error)
            return;
          }
          txDigest = digest;
        }

        // Send to server (with txDigest in IOTA mode)
        const { ok, payload, status } = await apiRequest<{ pixel: Pixel; newBalance: number; error?: string }>(
          "/api/canvas/pixel",
          {
            method: "POST",
            body: JSON.stringify({ x, y, color: selectedColor, txDigest }),
            headers: { "X-Wallet-Id": wallet.walletId },
          }
        );

        if (ok && payload.pixel) {
          // Update local canvas
          setColorData((prev) => {
            if (!prev) return prev;
            const next = new Uint8Array(prev);
            next[y * canvasWidth + x] = selectedColor;
            return next;
          });
          setPixelInfo(payload.pixel);
          // Update wallet balance
          if (typeof payload.newBalance === "number") {
            setWallet((w) => (w ? { ...w, balance: payload.newBalance } : w));
          }
          // Refresh price
          const priceRes = await apiRequest<{ price: number }>(`/api/canvas/price/${x}/${y}`);
          if (priceRes.ok) setNextPrice(priceRes.payload.price);
        } else {
          if (status === 429) {
            setError("Too fast! Wait a moment before placing more pixels.");
          } else if (status === 403 || payload.error === "PIXEL_SHIELDED") {
            setError("This pixel is shielded and cannot be overwritten.");
          } else if (status === 402) {
            setError("Insufficient balance! Use the faucet to get more tokens.");
          } else if (status === 503 || payload.error === "PAUSED") {
            setPaused(true);
            setError("Canvas is paused by admin.");
          } else if (payload.error) {
            setError(payload.error);
          }
        }
      } finally {
        setPlacing(false);
      }
    },
    [selectedPixel, selectedColor, canvasWidth, wallet, placing, signing, paused, paymentMode, collectionAddress, nextPrice, iotaPlacePixel]
  );

  // Auto-dismiss error after 3 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleWalletConnect = useCallback((w: WalletInfo) => {
    setWallet(w);
    setError(null);
  }, []);

  const handleBalanceUpdate = useCallback((balance: number) => {
    setWallet((w) => (w ? { ...w, balance } : w));
  }, []);

  // Deselect when clicking outside canvas
  const handleDeselect = useCallback(() => {
    setSelectedPixel(null);
    setPixelInfo(null);
    setNextPrice(null);
    setPixelShield(null);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#718096" }}>
        Loading canvas...
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* Header */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          zIndex: 100,
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e" }}>IOTA Place</span>
        <span style={{ marginLeft: 12, fontSize: 12, color: "#a0aec0" }}>{season ? season.name : "Off-Season"}</span>
        {paymentMode === "iota" && (
          <span style={{ marginLeft: 8, fontSize: 10, color: "#16a34a", background: "rgba(22,163,74,0.1)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
            IOTA
          </span>
        )}
        <span style={{ marginLeft: 12, fontSize: 11, color: connected ? "#16a34a" : "#dc2626" }}>
          {connected ? `${userCount} online` : "reconnecting..."}
        </span>
        <button
          onClick={() => setShowLeaderboard((s) => !s)}
          style={{
            marginLeft: 12,
            background: showLeaderboard ? "rgba(0,0,0,0.06)" : "transparent",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "4px 10px",
            color: "#4a5568",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Leaderboard
        </button>
        {/* Shop button — disabled for now
        <button
          onClick={() => setShowShop((s) => !s)}
          style={{
            marginLeft: 8,
            background: showShop ? "rgba(0,0,0,0.06)" : "transparent",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "4px 10px",
            color: "#4a5568",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Shop
        </button>
        */}
        {wallet && (
          <span style={{ marginLeft: "auto", marginRight: 16, fontSize: 13, color: "#d97706", fontWeight: 600 }}>
            {wallet.balance.toFixed(2)} IOTA
          </span>
        )}
      </div>

      {/* Pause banner */}
      {paused && (
        <div
          style={{
            position: "fixed",
            top: 44,
            left: 0,
            right: 0,
            background: "rgba(217,119,6,0.95)",
            color: "#fff",
            padding: "8px 0",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            zIndex: 99,
          }}
        >
          Canvas is paused
        </div>
      )}

      {/* Shield mode banner */}
      {shieldMode && (
        <div
          style={{
            position: "fixed",
            top: paused ? 80 : 44,
            left: 0,
            right: 0,
            background: "rgba(6,182,212,0.95)",
            color: "#fff",
            padding: "8px 0",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            zIndex: 99,
            cursor: "pointer",
          }}
          onClick={() => setShieldMode(null)}
        >
          Click a pixel you own to shield it (ESC to cancel)
        </div>
      )}

      {/* Canvas */}
      <div style={{ paddingTop: (paused ? 80 : 44) + (shieldMode ? 36 : 0), width: "100%", height: "100%" }}>
        <Canvas
          colorData={colorData}
          width={canvasWidth}
          height={canvasHeight}
          selectedColor={selectedColor}
          selectedPixel={selectedPixel}
          onPixelClick={handlePixelClick}
          onPixelHover={handlePixelHover}
          onDeselect={handleDeselect}
          activeShields={activeShields}
          shieldMode={!!shieldMode}
        />
      </div>

      {/* Error toast */}
      {error && (
        <div
          style={{
            position: "fixed",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(220,38,38,0.95)",
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 200,
            cursor: "pointer",
          }}
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}

      {/* Color Palette */}
      <ColorPalette selectedColor={selectedColor} onColorSelect={setSelectedColor} />

      {/* Pixel Info */}
      <PixelInfo
        pixel={pixelInfo}
        nextPrice={nextPrice}
        selectedPixel={selectedPixel}
        selectedColor={selectedColor}
        wallet={wallet}
        placing={placing || signing || paused}
        shield={pixelShield}
        onPlacePixel={handlePlacePixel}
        onDeselect={handleDeselect}
      />

      {/* Leaderboard */}
      <Leaderboard visible={showLeaderboard} onClose={() => setShowLeaderboard(false)} season={season} />

      {/* Power-Up Shop */}
      <PowerUpShop
        visible={showShop}
        onClose={() => setShowShop(false)}
        walletId={wallet?.walletId || null}
        balance={wallet?.balance || 0}
        activeShields={activeShields}
        onPurchase={(_inventoryId, newBalance) => {
          setWallet((w) => (w ? { ...w, balance: newBalance } : w));
        }}
        onActivate={(inventoryId) => {
          setShieldMode({ inventoryId });
          setShowShop(false);
        }}
      />

      {/* Wallet Panel */}
      <WalletPanel
        wallet={wallet}
        paymentMode={paymentMode}
        onConnect={handleWalletConnect}
        onBalanceUpdate={handleBalanceUpdate}
      />

      {/* Legal Footer */}
      <Footer onLegalPage={setLegalPage} />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
      {showCookieBanner && (
        <CookieBanner
          onAccept={() => { localStorage.setItem("cookie-consent", "accepted"); setShowCookieBanner(false); }}
          onMoreInfo={() => setLegalPage("datenschutz")}
        />
      )}

    </div>
  );
}

export default App;
