import { useRef, useEffect, useCallback, useState } from "react";
import { COLOR_PALETTE } from "../types";

interface ShieldOverlay {
  x: number;
  y: number;
}

interface CanvasProps {
  colorData: Uint8Array | null;
  width: number;
  height: number;
  selectedColor: number;
  selectedPixel: { x: number; y: number } | null;
  activeShields?: ShieldOverlay[];
  shieldMode?: boolean;
  onPixelClick: (x: number, y: number) => void;
  onPixelHover: (x: number, y: number) => void;
  onDeselect: () => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const val = parseInt(hex.slice(1), 16);
  return [(val >> 16) & 255, (val >> 8) & 255, val & 255];
}

export default function Canvas({ colorData, width, height, selectedColor, selectedPixel, activeShields, shieldMode, onPixelClick, onPixelHover, onDeselect }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(3);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastOffset = useRef({ x: 0, y: 0 });

  // Draw the canvas from color data
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colorData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < colorData.length; i++) {
      const [r, g, b] = hexToRgb(COLOR_PALETTE[colorData[i]] || "#FFFFFF");
      const off = i * 4;
      imageData.data[off] = r;
      imageData.data[off + 1] = g;
      imageData.data[off + 2] = b;
      imageData.data[off + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [colorData, width, height]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Draw selection + shield overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    overlay.width = width;
    overlay.height = height;
    ctx.clearRect(0, 0, width, height);

    // Draw shield indicators (cyan border around shielded pixels)
    if (activeShields && activeShields.length > 0) {
      const lw = Math.max(1.5 / zoom, 0.1);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = lw;
      for (const s of activeShields) {
        ctx.strokeRect(s.x, s.y, 1, 1);
      }
    }

    if (selectedPixel) {
      const { x, y } = selectedPixel;
      // Outer border (dark)
      const lw = Math.max(2 / zoom, 0.15);
      ctx.strokeStyle = shieldMode ? "#06b6d4" : "#1a1a2e";
      ctx.lineWidth = lw;
      ctx.strokeRect(x - lw, y - lw, 1 + lw * 2, 1 + lw * 2);
      // Inner border (white for contrast)
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = lw * 0.6;
      ctx.strokeRect(x, y, 1, 1);
    }
  }, [selectedPixel, width, height, zoom, activeShields, shieldMode]);

  // Center canvas helper (uses zoomRef to avoid re-triggering on zoom changes)
  const centerCanvas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setOffset({
      x: (rect.width - width * zoomRef.current) / 2,
      y: (rect.height - height * zoomRef.current) / 2,
    });
  }, [width, height]);

  // Calculate fitting zoom and center on mount or canvas resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Zoom so that canvas fills ~70% of viewport
    const fitZoom = Math.min(
      (rect.width * 0.7) / width,
      (rect.height * 0.7) / height
    );
    const newZoom = Math.max(1, Math.min(3, fitZoom));
    setZoom(newZoom);
    setOffset({
      x: (rect.width - width * newZoom) / 2,
      y: (rect.height - height * newZoom) / 2,
    });
  }, [width, height]);

  // Convert screen coords to pixel coords
  const screenToPixel = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const px = Math.floor((clientX - rect.left - offset.x) / zoom);
      const py = Math.floor((clientY - rect.top - offset.y) / zoom);
      if (px < 0 || px >= width || py < 0 || py >= height) return null;
      return { x: px, y: py };
    },
    [offset, zoom, width, height]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const oldZoom = zoom;
      const newZoom = Math.max(1, Math.min(40, oldZoom * (e.deltaY < 0 ? 1.15 : 0.87)));

      // Zoom toward mouse position
      const newOffsetX = mouseX - (mouseX - offset.x) * (newZoom / oldZoom);
      const newOffsetY = mouseY - (mouseY - offset.y) * (newZoom / oldZoom);

      setZoom(newZoom);
      setOffset({ x: newOffsetX, y: newOffsetY });
    },
    [zoom, offset]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        isDragging.current = false;
        dragStart.current = { x: e.clientX, y: e.clientY };
        lastOffset.current = { ...offset };
      }
    },
    [offset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // If mouse button held, check for drag
      if (e.buttons === 1) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          isDragging.current = true;
        }
        if (isDragging.current) {
          setOffset({
            x: lastOffset.current.x + dx,
            y: lastOffset.current.y + dy,
          });
          return;
        }
      }

      // Hover
      const pixel = screenToPixel(e.clientX, e.clientY);
      if (pixel) onPixelHover(pixel.x, pixel.y);
    },
    [screenToPixel, onPixelHover]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current && e.button === 0) {
        const pixel = screenToPixel(e.clientX, e.clientY);
        if (pixel) {
          onPixelClick(pixel.x, pixel.y);
        } else {
          onDeselect();
        }
      }
      isDragging.current = false;
    },
    [screenToPixel, onPixelClick, onDeselect]
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: isDragging.current ? "grabbing" : "crosshair",
        background: "#e5e7eb",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
        }}
      />
      <canvas
        ref={overlayRef}
        style={{
          imageRendering: "pixelated",
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          pointerEvents: "none",
        }}
      />
      {/* Zoom indicator */}
      <div
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(4px)",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 13,
          color: "#4a5568",
          zIndex: 10,
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            background: COLOR_PALETTE[selectedColor],
            border: "2px solid #1a1a2e",
            borderRadius: 3,
          }}
        />
        Zoom: {zoom.toFixed(1)}x
        <button
          onClick={centerCanvas}
          style={{
            background: "rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 14,
            color: "#4a5568",
            cursor: "pointer",
            lineHeight: 1,
          }}
          title="Center canvas"
        >
          ⊕
        </button>
      </div>
    </div>
  );
}
