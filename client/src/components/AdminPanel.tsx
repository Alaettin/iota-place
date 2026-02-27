import { useState, useEffect, useCallback } from "react";

interface AdminStats {
  totalPlacements: number;
  totalWallets: number;
  bannedWallets: number;
  totalSpent: number;
  canvasSize: string;
}

interface AdminWallet {
  id: string;
  address: string;
  displayName: string;
  balance: number;
  totalSpent: number;
  pixelCount: number;
  isBanned: boolean;
}

interface AdminPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function AdminPanel({ visible, onClose }: AdminPanelProps) {
  const [password, setPassword] = useState(() => localStorage.getItem("iota-place-admin-pw") || "");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "X-Admin-Password": password,
  }), [password]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats", { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setAuthenticated(true);
      localStorage.setItem("iota-place-admin-pw", password);
    } else {
      setAuthenticated(false);
      setError("Invalid admin password");
    }
  }, [headers, password]);

  const fetchWallets = useCallback(async () => {
    const res = await fetch(`/api/admin/wallets?search=${encodeURIComponent(search)}`, { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      setWallets(data.wallets);
    }
  }, [headers, search]);

  useEffect(() => {
    if (!visible || !authenticated) return;
    fetchStats();
    fetchWallets();
    const interval = setInterval(() => {
      fetchStats();
      fetchWallets();
    }, 10000);
    return () => clearInterval(interval);
  }, [visible, authenticated, fetchStats, fetchWallets]);

  const handleLogin = useCallback(async () => {
    setError(null);
    await fetchStats();
  }, [fetchStats]);

  const handleBan = useCallback(async (walletId: string, banned: boolean) => {
    await fetch(`/api/admin/wallets/${walletId}/ban`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ banned }),
    });
    fetchWallets();
  }, [headers, fetchWallets]);

  if (!visible) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.95)",
    zIndex: 300,
    overflowY: "auto",
    padding: 24,
  };

  // Login screen
  if (!authenticated) {
    return (
      <div style={panelStyle}>
        <div style={{ maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
          <h2 style={{ color: "#fff", marginBottom: 20 }}>Admin Panel</h2>
          {error && <div style={{ color: "#E50000", marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              marginBottom: 12,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleLogin}
              style={{
                flex: 1, padding: "10px 0", background: "#2450A4", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Login
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px", background: "transparent", color: "#888",
                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, fontSize: 14, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div style={panelStyle}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Admin Panel</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, padding: "6px 16px", color: "#888", fontSize: 13, cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Pixels Placed", value: stats.totalPlacements, color: "#94E044" },
              { label: "Wallets", value: stats.totalWallets, color: "#fff" },
              { label: "Banned", value: stats.bannedWallets, color: "#E50000" },
              { label: "IOTA Spent", value: stats.totalSpent.toFixed(2), color: "#FFD635" },
              { label: "Canvas", value: stats.canvasSize, color: "#ccc" },
            ].map((s) => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 8, textAlign: "center" }}>
                <div style={{ color: s.color, fontWeight: 700, fontSize: 20 }}>{s.value}</div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Wallet Management */}
        <h3 style={{ color: "#fff", marginBottom: 12 }}>Wallet Management</h3>
        <input
          type="text"
          placeholder="Search wallets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 13,
            marginBottom: 12,
            outline: "none",
          }}
        />

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#888", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ padding: "8px 6px" }}>Name</th>
                <th style={{ padding: "8px 6px" }}>Address</th>
                <th style={{ padding: "8px 6px" }}>Balance</th>
                <th style={{ padding: "8px 6px" }}>Spent</th>
                <th style={{ padding: "8px 6px" }}>Pixels</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", color: w.isBanned ? "#E50000" : "#ccc" }}>
                  <td style={{ padding: "8px 6px" }}>{w.displayName}</td>
                  <td style={{ padding: "8px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{w.address}</td>
                  <td style={{ padding: "8px 6px" }}>{w.balance.toFixed(2)}</td>
                  <td style={{ padding: "8px 6px", color: "#FFD635" }}>{w.totalSpent.toFixed(2)}</td>
                  <td style={{ padding: "8px 6px" }}>{w.pixelCount}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <span style={{ color: w.isBanned ? "#E50000" : "#94E044", fontWeight: 600 }}>
                      {w.isBanned ? "BANNED" : "Active"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <button
                      onClick={() => handleBan(w.id, !w.isBanned)}
                      style={{
                        background: w.isBanned ? "rgba(148,224,68,0.15)" : "rgba(229,0,0,0.15)",
                        border: `1px solid ${w.isBanned ? "rgba(148,224,68,0.3)" : "rgba(229,0,0,0.3)"}`,
                        borderRadius: 4,
                        padding: "3px 8px",
                        color: w.isBanned ? "#94E044" : "#E50000",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {w.isBanned ? "Unban" : "Ban"}
                    </button>
                  </td>
                </tr>
              ))}
              {wallets.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#666" }}>
                    No wallets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
