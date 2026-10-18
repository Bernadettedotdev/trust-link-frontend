import { expect, test } from "next/experimental/testmode/playwright";

import type { Escrow } from "@/types";

import { authenticatePage } from "./helpers/auth";
import { setupNetworkMocks } from "./helpers/mock-api";

const escrow: Escrow = {
  id: "notification-order",
  vendorId: "vendor-1",
  item: "Notification test order",
  amount: 25,
  status: "FUNDED",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  history: [{
    id: "notification-funded",
    escrowId: "notification-order",
    status: "FUNDED",
    timestamp: "2026-01-02T00:00:00Z",
    description: "Payment received for your order",
  }],
};

test.beforeEach(async ({ page, next }) => {
  await authenticatePage(page);
  await setupNetworkMocks(page, next, {
    escrowId: escrow.id,
    mockEscrow: escrow,
    mockEscrowsList: [escrow],
  });
});

test("bell navigation closes the preview and renders the tracked order", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications, 1 unread", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Notifications", exact: true });
  const link = preview.getByRole("link", { name: /Notification test order/ });
  await expect(link).toHaveAttribute("href", `/track/${escrow.id}`);
  await link.click();
  await expect(preview).toHaveCount(0);
  await expect(page).toHaveURL(`/track/${escrow.id}`);
  await expect(page.getByRole("heading", { name: "Track Your Order" })).toBeVisible();
  await expect(page.getByText(escrow.item, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("notifications.read") ?? "[]")))
    .toEqual(["notification-funded"]);
});

test("Enter on an inbox row follows its link and marks the notification read", async ({ page }) => {
  await page.goto("/notifications");
  const link = page.getByRole("link", { name: /Notification test order/ });
  await expect(link).toHaveAttribute("href", `/track/${escrow.id}`);
  await link.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(`/track/${escrow.id}`);
  await expect(page.getByRole("heading", { name: "Track Your Order" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("notifications.read") ?? "[]")))
    .toEqual(["notification-funded"]);
});
