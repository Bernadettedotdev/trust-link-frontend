import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "@/lib/analytics";

import EscrowLinkShareButtons from "../EscrowLinkShareButtons";

vi.mock("@/lib/analytics", () => ({ track: vi.fn().mockResolvedValue(undefined) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const url = "https://trustlink.example.com/pay/1293";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

describe.each([
  {
    platform: "twitter",
    button: "Copy for Twitter/X",
    text: `Pay securely via TrustLink escrow: Order (42) ${url}?utm_source=twitter&utm_medium=share`,
    event: "link_copied",
    properties: { platform: "twitter" },
    success: "Tweet text copied!",
  },
  {
    platform: "instagram",
    button: "Share on Instagram",
    text: `Secure payment link via TrustLink: ${url}\n\nCopy and paste in your bio or story!`,
    event: "link_shared",
    properties: { platform: "instagram", method: "clipboard" },
    success: "Instagram share text copied!",
  },
])("$platform clipboard recovery", ({ button, text, event, properties, success }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });

  afterEach(() => {
    for (const [key, descriptor] of [
      ["share", originalShare],
      ["clipboard", originalClipboard],
    ] as const) {
      if (descriptor) Object.defineProperty(navigator, key, descriptor);
      else Reflect.deleteProperty(navigator, key);
    }
  });

  function renderButtons() {
    render(
      <EscrowLinkShareButtons
        url={url}
        title="Order"
        amount={42}
        escrowId="1293"
        isCopying={false}
        copyStatus="idle"
        errorMsg={null}
        onCopy={vi.fn()}
        onNativeShare={vi.fn()}
      />
    );
  }

  it.each(["missing clipboard", "missing writeText", "denied write"])(
    "provides selectable text and allows a successful retry after %s",
    async (failure) => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: failure === "missing clipboard" ? undefined : failure === "missing writeText" ? {} : { writeText },
      });
      renderButtons();

      await user.click(screen.getByRole("button", { name: button }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't copy/i);
      const fallback = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Share text to copy manually" });
      expect(fallback).toHaveValue(text);
      expect(fallback).toHaveAttribute("readonly");
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalledWith(event, properties);
      await user.click(fallback);
      expect(fallback.selectionStart).toBe(0);
      expect(fallback.selectionEnd).toBe(text.length);

      writeText.mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      await user.click(screen.getByRole("button", { name: button }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledExactlyOnceWith(success));
      expect(writeText).toHaveBeenLastCalledWith(text);
      expect(track).toHaveBeenCalledWith(event, properties);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Share text to copy manually" })).not.toBeInTheDocument();
    }
  );

  it("waits for a successful write before reporting success", async () => {
    const user = userEvent.setup();
    let resolveWrite: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderButtons();

    await user.click(screen.getByRole("button", { name: button }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
    expect(toast.success).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith(event, properties);

    await act(async () => { resolveWrite?.(); });

    expect(toast.success).toHaveBeenCalledExactlyOnceWith(success);
    expect(track).toHaveBeenCalledWith(event, properties);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
