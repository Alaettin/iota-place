import { COLOR_PALETTE } from "../types";

interface ColorPaletteProps {
  selectedColor: number;
  onColorSelect: (color: number) => void;
}

export default function ColorPalette({ selectedColor, onColorSelect }: ColorPaletteProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 3,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        padding: 8,
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.06)",
        zIndex: 50,
      }}
    >
      {COLOR_PALETTE.map((hex, i) => (
        <button
          key={i}
          onClick={() => onColorSelect(i)}
          title={hex}
          style={{
            width: 28,
            height: 28,
            background: hex,
            border: selectedColor === i ? "3px solid #06b6d4" : "2px solid rgba(0,0,0,0.1)",
            borderRadius: 4,
            cursor: "pointer",
            transform: selectedColor === i ? "scale(1.2)" : "scale(1)",
            transition: "transform 0.1s, border 0.1s",
            outline: "none",
            boxShadow: selectedColor === i ? "0 0 10px rgba(6,182,212,0.3)" : "none",
          }}
        />
      ))}
    </div>
  );
}
