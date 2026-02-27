import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PowerUpShop from "./PowerUpShop";

// Mock api
vi.mock("../services/api", () => ({
  apiRequest: vi.fn().mockResolvedValue({
    ok: true,
    payload: {
      catalog: [
        { id: "shield", name: "Shield", description: "Protect a pixel for 1 hour", price: 2, durationSeconds: 3600 },
      ],
      inventory: [],
    },
  }),
}));

const defaultProps = {
  visible: true,
  onClose: vi.fn(),
  walletId: "w1",
  balance: 100,
  activeShields: [] as Array<{ x: number; y: number; expiresAt: string }>,
  onPurchase: vi.fn(),
  onActivate: vi.fn(),
};

describe("PowerUpShop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<PowerUpShop {...defaultProps} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders shop title", async () => {
    render(<PowerUpShop {...defaultProps} />);
    expect(screen.getByText("Power-Up Shop")).toBeInTheDocument();
  });

  it("renders shield in catalog", async () => {
    render(<PowerUpShop {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Shield")).toBeInTheDocument();
    });
    expect(screen.getByText("2 IOTA")).toBeInTheDocument();
  });

  it("buy button disabled without wallet", async () => {
    render(<PowerUpShop {...defaultProps} walletId={null} />);
    await waitFor(() => {
      expect(screen.getByText("Connect wallet")).toBeInTheDocument();
    });
  });

  it("buy button disabled with insufficient balance", async () => {
    render(<PowerUpShop {...defaultProps} balance={1} />);
    await waitFor(() => {
      expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
    });
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    render(<PowerUpShop {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByText("x"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders active shields with coordinates", () => {
    const shields = [
      { x: 5, y: 10, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    ];
    render(<PowerUpShop {...defaultProps} activeShields={shields} />);
    expect(screen.getByText("(5, 10)")).toBeInTheDocument();
  });

  it("shows 'Available' section header", async () => {
    render(<PowerUpShop {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Available")).toBeInTheDocument();
    });
  });
});
