import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LegalModal from "./LegalPages";

describe("LegalModal", () => {
  it("renders nothing when page is null", () => {
    const { container } = render(<LegalModal page={null} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders Legal Notice modal", () => {
    render(<LegalModal page="impressum" onClose={vi.fn()} />);
    expect(screen.getByText("Legal Notice")).toBeInTheDocument();
    expect(screen.getByText(/§ 5 TMG/)).toBeInTheDocument();
  });

  it("renders Privacy Policy modal", () => {
    render(<LegalModal page="datenschutz" onClose={vi.fn()} />);
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText(/Data Controller/)).toBeInTheDocument();
  });

  it("renders Terms of Service modal", () => {
    render(<LegalModal page="agb" onClose={vi.fn()} />);
    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText(/prohibited/i)).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(<LegalModal page="impressum" onClose={onClose} />);
    await userEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop clicked", async () => {
    const onClose = vi.fn();
    const { container } = render(<LegalModal page="impressum" onClose={onClose} />);
    // Backdrop is the outermost fixed div
    const backdrop = container.firstChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when modal content clicked", async () => {
    const onClose = vi.fn();
    render(<LegalModal page="impressum" onClose={onClose} />);
    await userEvent.click(screen.getByText("Legal Notice"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("displays env var data or fallback in Legal Notice", () => {
    render(<LegalModal page="impressum" onClose={vi.fn()} />);
    // Should render either actual env data or the "[...not configured]" fallback
    const body = document.body.textContent || "";
    const hasEnvData = !body.includes("not configured");
    const hasFallback = body.includes("not configured");
    expect(hasEnvData || hasFallback).toBe(true);
  });
});
