import { useRef, useEffect, useCallback, useState } from "react";
import { COLOR_PALETTE } from "../types";

interface CanvasProps {
  colorData: Uint8Array | null;
  width: number;
  height: number;
  selectedColor: number;
  onPixelClick: (x: number, y: number) => void;
  onPixelHover: (x: number, y: number) => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const val = parseInt(hex.slice(1), 16);
  return [(val >> 16) & 255, (val >> 8) & 255, val & 255];
}

export default function Canvas({ colorData, width, height, selectedColor, onPixelClick, onPixelHover }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(3);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
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

  // Center canvas on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setOffset({
      x: (rect.width - width * zoom) / 2,
      y: (rect.height - height * zoom) / 2,
    });
  }, [width, height, zoom]);

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
        if (pixel) onPixelClick(pixel.x, pixel.y);
      }
      isDragging.current = false;
    },
    [screenToPixel, onPixelClick]
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: isDragging.current ? "grabbing" : "crosshair",
        background: "#111",
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
        }}
      />
      {/* Selected color cursor preview */}
      <div
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(0,0,0,0.7)",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 13,
          color: "#ccc",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            background: COLOR_PALETTE[selectedColor],
            border: "2px solid #fff",
            borderRadius: 3,
          }}
        />
        Zoom: {zoom.toFixed(1)}x
      </div>
    </div>
  );
}
