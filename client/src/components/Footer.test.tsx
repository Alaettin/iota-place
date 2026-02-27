import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Footer from "./Footer";

describe("Footer", () => {
  it("renders all three legal links", () => {
    render(<Footer onLegalPage={vi.fn()} />);
    expect(screen.getByText("Legal Notice")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Terms")).toBeInTheDocument();
  });

  it('calls onLegalPage("impressum") on Legal Notice click', async () => {
    const onLegalPage = vi.fn();
    render(<Footer onLegalPage={onLegalPage} />);
    await userEvent.click(screen.getByText("Legal Notice"));
    expect(onLegalPage).toHaveBeenCalledWith("impressum");
  });

  it('calls onLegalPage("datenschutz") on Privacy click', async () => {
    const onLegalPage = vi.fn();
    render(<Footer onLegalPage={onLegalPage} />);
    await userEvent.click(screen.getByText("Privacy"));
    expect(onLegalPage).toHaveBeenCalledWith("datenschutz");
  });

  it('calls onLegalPage("agb") on Terms click', async () => {
    const onLegalPage = vi.fn();
    render(<Footer onLegalPage={onLegalPage} />);
    await userEvent.click(screen.getByText("Terms"));
    expect(onLegalPage).toHaveBeenCalledWith("agb");
  });
});
