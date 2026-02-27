import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CookieBanner from "./CookieBanner";

describe("CookieBanner", () => {
  it("renders banner text", () => {
    render(<CookieBanner onAccept={vi.fn()} onMoreInfo={vi.fn()} />);
    expect(screen.getByText(/localStorage/)).toBeInTheDocument();
    expect(screen.getByText(/No tracking cookies/)).toBeInTheDocument();
  });

  it("calls onAccept when Accept clicked", async () => {
    const onAccept = vi.fn();
    render(<CookieBanner onAccept={onAccept} onMoreInfo={vi.fn()} />);
    await userEvent.click(screen.getByText("Accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onMoreInfo when Learn more clicked", async () => {
    const onMoreInfo = vi.fn();
    render(<CookieBanner onAccept={vi.fn()} onMoreInfo={onMoreInfo} />);
    await userEvent.click(screen.getByText("Learn more"));
    expect(onMoreInfo).toHaveBeenCalledTimes(1);
  });
});
