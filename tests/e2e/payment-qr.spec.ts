import type { Download } from "@playwright/test";
import { expect, test } from "next/experimental/testmode/playwright";

import { authenticatePage } from "./helpers/auth";
import { setupNetworkMocks } from "./helpers/mock-api";
import { scanQrImage, supportsQrScanner } from "./helpers/qr-scanner";

const paymentUrls = [
  "https://trustlink.test/pay/ab",
  "https://trustlink.test/pay/ba",
  "https://trustlink.test/pay/order?amount=25&memo=buyer%20one",
  `https://trustlink.test/pay/order?memo=${"buyer%20".repeat(80)}&amount=25`,
];

async function downloadedPng(download: Download): Promise<string> {
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Download has no image data");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return `data:image/png;base64,${png.toString("base64")}`;
}

test("a scanner decodes each exact payment URL from the creation result", async ({ page, next }) => {
  await authenticatePage(page);
  await setupNetworkMocks(page, next);
  let currentUrl = paymentUrls[0];
  await page.route("**/api/escrow", (route) => route.fulfill({ json: { url: currentUrl } }));
  await page.goto("/create");
  test.skip(!(await supportsQrScanner(page)), "This browser platform has no native QR scanner");
  await page.getByLabel("Item name").fill("Camera");
  await page.getByLabel("Price (USDC)").fill("25");
  await page.getByLabel("Description").fill("A camera in working condition");

  for (const url of paymentUrls) {
    currentUrl = url;
    await page.getByRole("button", { name: /create escrow link/i }).click();
    await expect(page.getByTestId("shareable-url")).toHaveValue(url);
    await page.keyboard.press("Escape");
    const qr = page.getByTestId("link-card").getByRole("img", { name: `QR code for ${url}`, exact: true });
    const png = await qr.screenshot();
    expect(await scanQrImage(page, `data:image/png;base64,${png.toString("base64")}`)).toEqual([url]);
    const download = page.waitForEvent("download");
    await page.getByTestId("link-card").getByRole("button", { name: "Download QR", exact: true }).click();
    expect(await scanQrImage(page, await downloadedPng(await download))).toEqual([url]);
  }
});

// EscrowLinkCard currently has a Storybook surface but no application route.
test("the share card downloads the same URL encoded by its displayed QR", async ({ page }) => {
  const storybookUrl = process.env.STORYBOOK_URL;
  test.skip(!storybookUrl, "Set STORYBOOK_URL to run the share card browser test");
  await page.goto(`${storybookUrl}/iframe.html?id=escrow-escrowlinkcard--active&viewMode=story`);
  test.skip(!(await supportsQrScanner(page)), "This browser platform has no native QR scanner");
  const url = await page.getByTestId("escrow-link").inputValue();
  const png = await page.getByTestId("qr-code").screenshot();
  expect(await scanQrImage(page, `data:image/png;base64,${png.toString("base64")}`)).toEqual([url]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR", exact: true }).click();
  expect(await scanQrImage(page, await downloadedPng(await download))).toEqual([url]);
});
