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
  season?: { id: number; name: string } | null;
}

export default function Leaderboard({ visible, onClose, season }: LeaderboardProps) {
  const [type, setType] = useState<"pixels" | "spent">("pixels");
  const [scope, setScope] = useState<"alltime" | "season">("alltime");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  // Reset scope to alltime when season ends
  useEffect(() => {
    if (!season && scope === "season") setScope("alltime");
  }, [season, scope]);

  const fetchData = useCallback(async () => {
    const lbUrl = scope === "season" && season
      ? `/api/leaderboard/season/${season.id}?type=${type}`
      : `/api/leaderboard?type=${type}`;
    const lbRes = await apiRequest<{ leaderboard: LeaderboardEntry[] }>(lbUrl);
    if (lbRes.ok) setEntries(lbRes.payload.leaderboard);
  }, [type, scope, season]);

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
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        padding: 16,
        borderRadius: 10,
        width: 300,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
        border: "1px solid rgba(0,0,0,0.08)",
        zIndex: 150,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>Leaderboard</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#a0aec0", fontSize: 18, cursor: "pointer" }}
        >
          x
        </button>
      </div>

      {/* Scope toggle */}
      {season && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setScope("alltime")}
            style={{
              flex: 1,
              padding: "5px 0",
              background: scope === "alltime" ? "rgba(0,0,0,0.06)" : "transparent",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              color: scope === "alltime" ? "#1a1a2e" : "#a0aec0",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            All Time
          </button>
          <button
            onClick={() => setScope("season")}
            style={{
              flex: 1,
              padding: "5px 0",
              background: scope === "season" ? "rgba(22,163,74,0.1)" : "transparent",
              border: `1px solid ${scope === "season" ? "rgba(22,163,74,0.3)" : "rgba(0,0,0,0.1)"}`,
              borderRadius: 6,
              color: scope === "season" ? "#16a34a" : "#a0aec0",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {season.name}
          </button>
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
              background: type === t ? "rgba(0,0,0,0.06)" : "transparent",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              color: type === t ? "#1a1a2e" : "#a0aec0",
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
        <div style={{ color: "#a0aec0", fontSize: 12, textAlign: "center", padding: 20 }}>
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
                background: e.rank <= 3 ? "rgba(217,119,6,0.06)" : "transparent",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 24,
                  textAlign: "center",
                  fontWeight: 700,
                  color: e.rank === 1 ? "#d97706" : e.rank === 2 ? "#718096" : e.rank === 3 ? "#A06A42" : "#a0aec0",
                }}
              >
                {e.rank}
              </span>
              <span style={{ flex: 1, color: "#4a5568", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.displayName}
              </span>
              <span style={{ color: type === "spent" ? "#d97706" : "#16a34a", fontWeight: 600 }}>
                {type === "spent" ? `${e.score.toFixed(2)} IOTA` : `${e.score} px`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
