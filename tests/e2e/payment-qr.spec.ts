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
  }
});
