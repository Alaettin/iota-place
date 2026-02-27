import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../services/api";

interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

interface WalletPanelProps {
  wallet: WalletInfo | null;
  onConnect: (wallet: WalletInfo) => void;
  onBalanceUpdate: (balance: number) => void;
}

export default function WalletPanel({ wallet, onConnect, onBalanceUpdate }: WalletPanelProps) {
  const [connecting, setConnecting] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // Auto-reconnect on mount
  useEffect(() => {
    const saved = localStorage.getItem("iota-place-wallet");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as WalletInfo;
        // Verify wallet still exists
        fetch("/api/wallet/me", {
          headers: { "X-Wallet-Id": parsed.walletId },
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok) onConnect(data.wallet);
          })
          .catch(() => localStorage.removeItem("iota-place-wallet"));
      } catch {
        localStorage.removeItem("iota-place-wallet");
      }
    }
  }, [onConnect]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { ok, payload } = await apiRequest<{ wallet: WalletInfo }>("/api/wallet/connect", {
        method: "POST",
        body: JSON.stringify({ displayName: displayName || undefined }),
      });
      if (ok) {
        localStorage.setItem("iota-place-wallet", JSON.stringify(payload.wallet));
        onConnect(payload.wallet);
      }
    } finally {
      setConnecting(false);
    }
  }, [displayName, onConnect]);

  const handleFaucet = useCallback(async () => {
    if (!wallet) return;
    const { ok, payload } = await apiRequest<{ wallet: WalletInfo }>("/api/wallet/faucet", {
      method: "POST",
      headers: { "X-Wallet-Id": wallet.walletId },
    });
    if (ok) {
      onBalanceUpdate(payload.wallet.balance);
    }
  }, [wallet, onBalanceUpdate]);

  const handleDisconnect = useCallback(() => {
    localStorage.removeItem("iota-place-wallet");
    onConnect(null as unknown as WalletInfo);
  }, [onConnect]);

  // Not connected
  if (!wallet) {
    return (
      <div
        style={{
          position: "fixed",
          top: 56,
          right: 12,
          background: "rgba(0,0,0,0.85)",
          padding: 16,
          borderRadius: 10,
          width: 240,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
          Connect Wallet
        </div>
        <input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            marginBottom: 10,
            outline: "none",
          }}
        />
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            width: "100%",
            padding: "8px 0",
            background: "#2450A4",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: connecting ? "wait" : "pointer",
            opacity: connecting ? 0.6 : 1,
          }}
        >
          {connecting ? "Connecting..." : "Connect (Mock)"}
        </button>
      </div>
    );
  }

  // Connected
  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        right: 12,
        background: "rgba(0,0,0,0.85)",
        padding: 14,
        borderRadius: 10,
        width: 240,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{wallet.displayName}</span>
        <button
          onClick={handleDisconnect}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 8, wordBreak: "break-all" }}>
        {wallet.address.slice(0, 20)}...
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.06)",
          padding: "8px 10px",
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, color: "#ccc" }}>Balance</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#FFD635" }}>
          {wallet.balance.toFixed(2)} IOTA
        </span>
      </div>

      <button
        onClick={handleFaucet}
        style={{
          width: "100%",
          padding: "7px 0",
          background: "rgba(148,224,68,0.15)",
          color: "#94E044",
          border: "1px solid rgba(148,224,68,0.3)",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Get Test Tokens (50 IOTA)
      </button>
    </div>
  );
}
