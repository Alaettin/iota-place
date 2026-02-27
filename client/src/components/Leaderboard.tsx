import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../services/api";

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  address: string;
  score: number;
}

interface LeaderboardProps {
  visible: boolean;
  onClose: () => void;
}

export default function Leaderboard({ visible, onClose }: LeaderboardProps) {
  const [type, setType] = useState<"pixels" | "spent">("pixels");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<{ totalPlacements: number; totalWallets: number; totalSpent: number } | null>(null);

  const fetchData = useCallback(async () => {
    const [lbRes, statsRes] = await Promise.all([
      apiRequest<{ leaderboard: LeaderboardEntry[] }>(`/api/leaderboard?type=${type}`),
      apiRequest<{ stats: { totalPlacements: number; totalWallets: number; totalSpent: number } }>("/api/stats"),
    ]);
    if (lbRes.ok) setEntries(lbRes.payload.leaderboard);
    if (statsRes.ok) setStats(statsRes.payload.stats);
  }, [type]);

  useEffect(() => {
    if (!visible) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [visible, fetchData]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        left: 12,
        background: "rgba(0,0,0,0.9)",
        padding: 16,
        borderRadius: 10,
        width: 300,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        zIndex: 150,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Leaderboard</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer" }}
        >
          x
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 14,
            fontSize: 11,
            textAlign: "center",
          }}
        >
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 6, borderRadius: 6 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{stats.totalPlacements}</div>
            <div style={{ color: "#888" }}>Pixels</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 6, borderRadius: 6 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{stats.totalWallets}</div>
            <div style={{ color: "#888" }}>Wallets</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 6, borderRadius: 6 }}>
            <div style={{ color: "#FFD635", fontWeight: 700, fontSize: 14 }}>{stats.totalSpent.toFixed(1)}</div>
            <div style={{ color: "#888" }}>IOTA spent</div>
          </div>
        </div>
      )}

      {/* Toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["pixels", "spent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1,
              padding: "6px 0",
              background: type === t ? "rgba(255,255,255,0.15)" : "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              color: type === t ? "#fff" : "#888",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t === "pixels" ? "Most Pixels" : "Top Spenders"}
          </button>
        ))}
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div style={{ color: "#666", fontSize: 12, textAlign: "center", padding: 20 }}>
          No data yet. Start placing pixels!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {entries.map((e) => (
            <div
              key={e.rank}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: e.rank <= 3 ? "rgba(255,214,53,0.08)" : "transparent",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 24,
                  textAlign: "center",
                  fontWeight: 700,
                  color: e.rank === 1 ? "#FFD635" : e.rank === 2 ? "#E4E4E4" : e.rank === 3 ? "#A06A42" : "#888",
                }}
              >
                {e.rank}
              </span>
              <span style={{ flex: 1, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.displayName}
              </span>
              <span style={{ color: type === "spent" ? "#FFD635" : "#94E044", fontWeight: 600 }}>
                {type === "spent" ? `${e.score.toFixed(2)} IOTA` : `${e.score} px`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
