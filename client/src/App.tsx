import { useState, useEffect, useCallback, useRef } from "react";
import Canvas from "./components/Canvas";
import ColorPalette from "./components/ColorPalette";
import PixelInfo from "./components/PixelInfo";
import WalletPanel from "./components/WalletPanel";
import { fetchCanvasBinary, apiRequest } from "./services/api";
import { Pixel } from "./types";

interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

function App() {
  const [colorData, setColorData] = useState<Uint8Array | null>(null);
  const [canvasWidth] = useState(250);
  const [canvasHeight] = useState(250);
  const [selectedColor, setSelectedColor] = useState(5);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [pixelInfo, setPixelInfo] = useState<Pixel | null>(null);
  const [nextPrice, setNextPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Load canvas on mount
  useEffect(() => {
    fetchCanvasBinary()
      .then((data) => {
        setColorData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Handle pixel hover
  const handlePixelHover = useCallback((x: number, y: number) => {
    setHoverCoords({ x, y });
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(async () => {
      const { ok, payload } = await apiRequest<{ pixel: Pixel; nextPrice: number }>(
        `/api/canvas/pixel/${x}/${y}`
      );
      if (ok) {
        setPixelInfo(payload.pixel);
        setNextPrice(payload.nextPrice);
      }
    }, 50);
  }, []);

  // Handle pixel click
  const handlePixelClick = useCallback(
    async (x: number, y: number) => {
      setError(null);

      if (!wallet) {
        setError("Connect your wallet first!");
        return;
      }

      const { ok, payload, status } = await apiRequest<{ pixel: Pixel; newBalance: number; error?: string }>(
        "/api/canvas/pixel",
        {
          method: "POST",
          body: JSON.stringify({ x, y, color: selectedColor }),
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
        if (status === 402) {
          setError("Insufficient balance! Use the faucet to get more tokens.");
        } else if (payload.error) {
          setError(payload.error);
        }
      }
    },
    [selectedColor, canvasWidth, wallet]
  );

  const handleWalletConnect = useCallback((w: WalletInfo) => {
    setWallet(w);
    setError(null);
  }, []);

  const handleBalanceUpdate = useCallback((balance: number) => {
    setWallet((w) => (w ? { ...w, balance } : w));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#888" }}>
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
          background: "rgba(0,0,0,0.85)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          zIndex: 100,
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>IOTA Place</span>
        <span style={{ marginLeft: 12, fontSize: 12, color: "#666" }}>Season 1</span>
        {wallet && (
          <span style={{ marginLeft: "auto", marginRight: 16, fontSize: 13, color: "#FFD635", fontWeight: 600 }}>
            {wallet.balance.toFixed(2)} IOTA
          </span>
        )}
      </div>

      {/* Canvas */}
      <div style={{ paddingTop: 44, width: "100%", height: "100%" }}>
        <Canvas
          colorData={colorData}
          width={canvasWidth}
          height={canvasHeight}
          selectedColor={selectedColor}
          onPixelClick={handlePixelClick}
          onPixelHover={handlePixelHover}
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
            background: "rgba(229,0,0,0.9)",
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
      <PixelInfo pixel={pixelInfo} nextPrice={nextPrice} hoverCoords={hoverCoords} />

      {/* Wallet Panel */}
      <WalletPanel wallet={wallet} onConnect={handleWalletConnect} onBalanceUpdate={handleBalanceUpdate} />
    </div>
  );
}

export default App;
