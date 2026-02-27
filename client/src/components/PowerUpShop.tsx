import { useState, useEffect } from "react";
import { apiRequest } from "../services/api";

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  durationSeconds: number | null;
}

interface InventoryItem {
  id: number;
  powerUpId: string;
  purchasedAt: string;
}

interface ActiveShield {
  x: number;
  y: number;
  expiresAt: string;
}

interface PowerUpShopProps {
  visible: boolean;
  onClose: () => void;
  walletId: string | null;
  balance: number;
  activeShields: ActiveShield[];
  onPurchase: (inventoryId: number, newBalance: number) => void;
  onActivate: (inventoryId: number) => void;
}

export default function PowerUpShop({
  visible,
  onClose,
  walletId,
  balance,
  activeShields,
  onPurchase,
  onActivate,
}: PowerUpShopProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load catalog on mount
  useEffect(() => {
    apiRequest<{ catalog: CatalogItem[] }>("/api/powerups/catalog").then(({ ok, payload }) => {
      if (ok) setCatalog(payload.catalog);
    });
  }, []);

  // Load inventory when visible and wallet connected
  useEffect(() => {
    if (!visible || !walletId) return;
    apiRequest<{ inventory: InventoryItem[] }>("/api/powerups/inventory").then(({ ok, payload }) => {
      if (ok) setInventory(payload.inventory);
    });
  }, [visible, walletId]);

  if (!visible) return null;

  const handleBuy = async (powerUpId: string) => {
    if (!walletId || buying) return;
    setBuying(true);
    setError(null);

    const { ok, payload, status } = await apiRequest<{ inventoryId: number; newBalance: number; error?: string }>(
      "/api/powerups/purchase",
      {
        method: "POST",
        body: JSON.stringify({ powerUpId }),
      }
    );

    if (ok) {
      setInventory((prev) => [
        { id: payload.inventoryId, powerUpId, purchasedAt: new Date().toISOString() },
        ...prev,
      ]);
      onPurchase(payload.inventoryId, payload.newBalance);
    } else {
      if (status === 402) setError("Insufficient balance!");
      else setError(payload.error || "Purchase failed");
    }
    setBuying(false);
  };

  const handleActivate = (inventoryId: number) => {
    // Remove from local inventory immediately
    setInventory((prev) => prev.filter((item) => item.id !== inventoryId));
    onActivate(inventoryId);
  };

  const timeRemaining = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const min = Math.ceil(ms / 60000);
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        left: 12,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        padding: "16px 20px",
        borderRadius: 12,
        width: 280,
        maxHeight: "70vh",
        overflow: "auto",
        fontSize: 13,
        color: "#64748b",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.06)",
        zIndex: 150,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Power-Up Shop</span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            fontSize: 16,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          x
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}

      {/* Catalog */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
          Available
        </div>
        {catalog.map((item) => (
          <div
            key={item.id}
            style={{
              background: "#f8f9fc",
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>{item.name}</span>
              <span style={{ color: "#d97706", fontWeight: 700, fontSize: 12 }}>{item.price} IOTA</span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{item.description}</div>
            <button
              onClick={() => handleBuy(item.id)}
              disabled={!walletId || buying || balance < item.price}
              style={{
                width: "100%",
                padding: "6px 0",
                background: !walletId || balance < item.price ? "#f1f5f9" : "linear-gradient(135deg, #06b6d4, #3b82f6)",
                color: !walletId || balance < item.price ? "#94a3b8" : "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: !walletId || buying || balance < item.price ? "not-allowed" : "pointer",
              }}
            >
              {!walletId ? "Connect wallet" : buying ? "Buying..." : balance < item.price ? "Insufficient balance" : "Buy"}
            </button>
          </div>
        ))}
      </div>

      {/* Inventory */}
      {inventory.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Inventory ({inventory.length})
          </div>
          {inventory.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                background: "rgba(6,182,212,0.08)",
                borderRadius: 6,
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 12 }}>Shield</span>
              <button
                onClick={() => handleActivate(item.id)}
                style={{
                  padding: "4px 12px",
                  background: "rgba(22,163,74,0.08)",
                  color: "#16a34a",
                  border: "1px solid rgba(22,163,74,0.2)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Activate
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Shields */}
      {activeShields.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Active Shields ({activeShields.length})
          </div>
          {activeShields.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                background: "rgba(6,182,212,0.06)",
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 12,
              }}
            >
              <span style={{ color: "#64748b" }}>
                ({s.x}, {s.y})
              </span>
              <span style={{ color: "#06b6d4", fontWeight: 600 }}>{timeRemaining(s.expiresAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
