import type React from "react";

export const theme = {
  bg: {
    body: "#f8f9fc",
    panel: "rgba(255,255,255,0.85)",
    input: "#f1f5f9",
    hover: "rgba(0,0,0,0.03)",
    canvas: "#eef1f6",
  },
  border: {
    panel: "1px solid rgba(0,0,0,0.06)",
    input: "1px solid #e2e8f0",
  },
  shadow: {
    panel: "0 4px 20px rgba(0,0,0,0.06)",
  },
  text: {
    primary: "#0f172a",
    secondary: "#64748b",
    tertiary: "#94a3b8",
    label: "#94a3b8",
  },
  accent: {
    solid: "#06b6d4",
    gradient: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  },
  color: {
    danger: "#ef4444",
    success: "#16a34a",
    warning: "#d97706",
  },
  radius: { sm: 6, md: 10, lg: 14 },
  glass: {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  } as React.CSSProperties,
};
