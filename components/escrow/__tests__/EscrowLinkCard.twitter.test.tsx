import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EscrowLinkCard from "../EscrowLinkCard";
import EscrowLinkShareButtons from "../EscrowLinkShareButtons";

// Mock the QR canvas so jsdom doesn't try to draw to a real canvas.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <canvas data-testid="qr-code" />,
}));

// Capture toast calls without rendering the sonner portal.
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (msg: string) => toastSuccess(msg) },
}));

describe("EscrowLinkCard — Copy for Twitter/X (issue #64)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders a Copy for Twitter/X button once the link loads", async () => {
    render(<EscrowLinkCard />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /copy for twitter\/x/i })
      ).toBeInTheDocument()
    );
  });

  it("copies pre-formatted tweet text including the link to the clipboard", async () => {
    render(<EscrowLinkCard />);
    const button = await screen.findByRole("button", {
      name: /copy for twitter\/x/i,
    });

    await userEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const copied = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as string;

    // Pre-formatted text mentions the escrow and carries the share link.
    expect(copied).toMatch(/TrustLink/i);
    expect(copied).toContain("https://trustlink.example.com/pay/1293");
    expect(copied).toContain("utm_source=twitter");
  });

  it("shows a success toast after copying", async () => {
    render(<EscrowLinkCard />);
    const button = await screen.findByRole("button", {
      name: /copy for twitter\/x/i,
    });

    await userEvent.click(button);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Tweet text copied!")
    );
  });

  it.each([
    "https://trustlink.example.com/pay/1293",
    "https://trustlink.example.com/pay/1293?currency=USDC&note=order%20total",
    "https://trustlink.example.com/pay/1293#details",
    "https://trustlink.example.com/pay/1293?currency=USDC#details",
    "https://trustlink.example.com/pay/1293?utm_source=old&utm_source=duplicate&utm_medium=email&utm_medium=duplicate&utm_campaign=launch#details",
  ])("preserves the payment URL while setting Twitter attribution: %s", async (url) => {
    render(
      <EscrowLinkShareButtons
        url={url}
        title="Escrow Agreement 1293"
        amount={12450}
        escrowId="1293"
        isCopying={false}
        copyStatus="idle"
        errorMsg={null}
        onCopy={vi.fn()}
        onNativeShare={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /copy for twitter\/x/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    const sharedUrl = new URL(copied.slice(copied.lastIndexOf(" ") + 1));
    const original = new URL(url);

    expect(copied).toBe(`Pay securely via TrustLink escrow: Escrow Agreement 1293 (12450) ${sharedUrl}`);
    expect(sharedUrl.origin).toBe(original.origin);
    expect(sharedUrl.pathname).toBe(original.pathname);
    expect(sharedUrl.hash).toBe(original.hash);
    expect(sharedUrl.searchParams.getAll("utm_source")).toEqual(["twitter"]);
    expect(sharedUrl.searchParams.getAll("utm_medium")).toEqual(["share"]);
    for (const [key, value] of original.searchParams) {
      if (key !== "utm_source" && key !== "utm_medium") {
        expect(sharedUrl.searchParams.getAll(key)).toContain(value);
      }
    }
  });
});
