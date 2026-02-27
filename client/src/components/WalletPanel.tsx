import { useState, useEffect, useCallback } from "react";
import { ConnectButton, useCurrentAccount, useDisconnectWallet, useIotaClientQuery } from "@iota/dapp-kit";
import { apiRequest, setAuthToken } from "../services/api";

interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

interface WalletPanelProps {
  wallet: WalletInfo | null;
  paymentMode: "mock" | "iota";
  network?: string;
  onConnect: (wallet: WalletInfo) => void;
  onBalanceUpdate: (balance: number) => void;
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 56,
  right: 12,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px)",
  padding: 16,
  borderRadius: 10,
  width: 260,
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.06)",
  zIndex: 50,
};

export default function WalletPanel({ wallet, paymentMode, network, onConnect, onBalanceUpdate }: WalletPanelProps) {
  const isMainnet = network === "mainnet";
  if (paymentMode === "iota") {
    return <IotaWalletPanel wallet={wallet} isMainnet={isMainnet} onConnect={onConnect} onBalanceUpdate={onBalanceUpdate} />;
  }
  return <MockWalletPanel wallet={wallet} isMainnet={isMainnet} onConnect={onConnect} onBalanceUpdate={onBalanceUpdate} />;
}

// ─── IOTA Mode ──────────────────────────────────────────────────

function IotaWalletPanel({
  wallet,
  isMainnet,
  onConnect,
  onBalanceUpdate,
}: {
  wallet: WalletInfo | null;
  isMainnet: boolean;
  onConnect: (wallet: WalletInfo) => void;
  onBalanceUpdate: (balance: number) => void;
}) {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  // Query on-chain balance when connected
  const { data: balanceData } = useIotaClientQuery(
    "getBalance",
    { owner: account?.address || "" },
    { enabled: !!account?.address, refetchInterval: 10000 }
  );

  // When wallet connects via dapp-kit, register with our server
  useEffect(() => {
    if (!account?.address) return;
    const address = account.address;

    apiRequest<{ wallet: WalletInfo; token: string }>("/api/wallet/connect", {
      method: "POST",
      body: JSON.stringify({ address, displayName: address.slice(0, 10) }),
    }).then(({ ok, payload }) => {
      if (ok) {
        setAuthToken(payload.token);
        sessionStorage.setItem("iota-place-token", payload.token);
        sessionStorage.setItem("iota-place-wallet", JSON.stringify(payload.wallet));
        onConnect(payload.wallet);
      }
    });
  }, [account?.address, onConnect]);

  // Update balance from on-chain data
  useEffect(() => {
    if (balanceData?.totalBalance && wallet) {
      const balanceIota = Number(BigInt(balanceData.totalBalance)) / 1e9;
      onBalanceUpdate(balanceIota);
    }
  }, [balanceData?.totalBalance, wallet, onBalanceUpdate]);

  const handleFaucet = useCallback(async () => {
    if (!wallet) return;
    await apiRequest<{ wallet: WalletInfo }>("/api/wallet/faucet", {
      method: "POST",
    });
    // Balance will auto-refresh via refetchInterval
  }, [wallet]);

  const handleDisconnect = useCallback(() => {
    sessionStorage.removeItem("iota-place-token");
    sessionStorage.removeItem("iota-place-wallet");
    setAuthToken(null);
    disconnect();
    onConnect(null as unknown as WalletInfo);
  }, [disconnect, onConnect]);

  // Not connected — show dapp-kit ConnectButton
  if (!account) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          Connect IOTA Wallet
        </div>
        <ConnectButton />
      </div>
    );
  }

  // Connected
  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
          {wallet?.displayName || account.address.slice(0, 10)}
        </span>
        <button
          onClick={handleDisconnect}
          style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
        >
          Disconnect
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, wordBreak: "break-all" }}>
        {account.address.slice(0, 20)}...
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f1f5f9",
          padding: "8px 10px",
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, color: "#64748b" }}>Balance</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#d97706" }}>
          {wallet ? wallet.balance.toFixed(2) : "..."} IOTA
        </span>
      </div>

      {!isMainnet && (
        <button
          onClick={handleFaucet}
          style={{
            width: "100%",
            padding: "7px 0",
            background: "rgba(22,163,74,0.06)",
            color: "#16a34a",
            border: "1px solid rgba(22,163,74,0.15)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Request Testnet Tokens
        </button>
      )}
    </div>
  );
}

// ─── Mock Mode ──────────────────────────────────────────────────

function MockWalletPanel({
  wallet,
  isMainnet,
  onConnect,
  onBalanceUpdate,
}: {
  wallet: WalletInfo | null;
  isMainnet: boolean;
  onConnect: (wallet: WalletInfo) => void;
  onBalanceUpdate: (balance: number) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // Auto-reconnect on mount from sessionStorage
  useEffect(() => {
    const token = sessionStorage.getItem("iota-place-token");
    const saved = sessionStorage.getItem("iota-place-wallet");
    if (token && saved) {
      try {
        setAuthToken(token);
        apiRequest<{ ok: boolean; wallet: WalletInfo }>("/api/wallet/me")
          .then(({ ok, payload }) => {
            if (ok) onConnect(payload.wallet);
            else {
              sessionStorage.removeItem("iota-place-token");
              sessionStorage.removeItem("iota-place-wallet");
              setAuthToken(null);
            }
          })
          .catch(() => {
            sessionStorage.removeItem("iota-place-token");
            sessionStorage.removeItem("iota-place-wallet");
            setAuthToken(null);
          });
      } catch {
        sessionStorage.removeItem("iota-place-token");
        sessionStorage.removeItem("iota-place-wallet");
        setAuthToken(null);
      }
    }
  }, [onConnect]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { ok, payload } = await apiRequest<{ wallet: WalletInfo; token: string }>("/api/wallet/connect", {
        method: "POST",
        body: JSON.stringify({ displayName: displayName || undefined }),
      });
      if (ok) {
        setAuthToken(payload.token);
        sessionStorage.setItem("iota-place-token", payload.token);
        sessionStorage.setItem("iota-place-wallet", JSON.stringify(payload.wallet));
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
    });
    if (ok) {
      onBalanceUpdate(payload.wallet.balance);
    }
  }, [wallet, onBalanceUpdate]);

  const handleDisconnect = useCallback(() => {
    sessionStorage.removeItem("iota-place-token");
    sessionStorage.removeItem("iota-place-wallet");
    setAuthToken(null);
    onConnect(null as unknown as WalletInfo);
  }, [onConnect]);

  if (!wallet) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
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
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            color: "#0f172a",
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
            background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
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

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{wallet.displayName}</span>
        <button
          onClick={handleDisconnect}
          style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
        >
          Disconnect
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, wordBreak: "break-all" }}>
        {wallet.address.slice(0, 20)}...
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f1f5f9",
          padding: "8px 10px",
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, color: "#64748b" }}>Balance</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#d97706" }}>
          {wallet.balance.toFixed(2)} IOTA
        </span>
      </div>

      {!isMainnet && (
        <button
          onClick={handleFaucet}
          style={{
            width: "100%",
            padding: "7px 0",
            background: "rgba(22,163,74,0.06)",
            color: "#16a34a",
            border: "1px solid rgba(22,163,74,0.15)",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Get Test Tokens (50 IOTA)
        </button>
      )}
    </div>
  );
}
