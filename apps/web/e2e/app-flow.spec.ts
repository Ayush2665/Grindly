import { expect, test, type Page } from "@playwright/test";

let n = 0;
async function signIn(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("E2E User");
  await page.getByPlaceholder("Email").fill(`app-${Date.now()}-${++n}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your contracts", { exact: true })).toBeVisible();
}

async function linkWatch(page: Page) {
  await page.goto("/watch");
  await page.getByRole("button", { name: "Show pairing code" }).click();
  const code = (await page.getByTestId("pair-code").getAttribute("aria-label"))!.replace("Pairing code ", "");
  const { token } = (await (await page.request.post("/api/v1/devices/pair", { data: { code } })).json()) as { token: string };
  await upload(page, token, 25);
  return token;
}
const upload = async (page: Page, token: string, value: number) => {
  const start = new Date(Date.now() - 20 * 60_000);
  const r = await page.request.post("/api/v1/ingest/batch", {
    headers: { authorization: `Bearer ${token}` },
    data: { samples: [{ kind: "steps", hkUuid: `app-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, start: start.toISOString(), end: new Date(start.getTime() + 60_000).toISOString(), value, productType: "Watch7,3", wasUserEntered: false }] },
  });
  expect((await r.json()).accepted).toBe(1);
};

test("create goal, get verified, close the day, see money in the wallet, withdraw", async ({ page }) => {
  await signIn(page);
  const token = await linkWatch(page);

  await page.goto("/create");
  await expect(page.getByTestId("stake")).toHaveText("₹2,700");
  await page.getByRole("button", { name: "Continue to test payment" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // before any day is paid the whole stake sits in escrow
  await page.goto("/wallet");
  await expect(page.getByTestId("balance")).toHaveText("₹0");
  await expect(page.getByTestId("escrow")).toHaveText("₹2,700");
  await expect(page.getByTestId("ledger")).toContainText("Funded contract (test payment)");
  await expect(page.getByTestId("ledger")).toContainText("-₹2,700");

  await upload(page, token, 10500);
  await page.goto("/today");
  await expect(page.getByTestId("verdict")).toHaveText("Verified");
  await page.getByTestId("fast-forward").click();
  await expect(page.getByRole("status")).toContainText("Day 1 closed: ₹100 released");
  await expect(page.getByTestId("grid").locator("i.v")).toHaveCount(1);

  await page.goto("/wallet");
  await expect(page.getByTestId("balance")).toHaveText("₹100");
  await expect(page.getByTestId("escrow")).toHaveText("₹2,600");
  await expect(page.getByTestId("ledger")).toContainText("Verified day 1");

  await page.getByRole("button", { name: "Withdraw (simulated)" }).click();
  await expect(page.getByRole("status")).toContainText("withdrawn (simulated)");
  await expect(page.getByTestId("balance")).toHaveText("₹0");
  await expect(page.getByTestId("ledger")).toContainText("Withdrawal (simulated)");
});

test("an unpassed day inside the rest allowance moves no money", async ({ page }) => {
  await signIn(page);
  await linkWatch(page);
  await page.goto("/create");
  await page.getByRole("button", { name: "Continue to test payment" }).click();
  await page.getByTestId("fast-forward").click();
  await expect(page.getByRole("status")).toContainText("rest day, no money moved");
  await expect(page.getByTestId("grid").locator("i.r")).toHaveCount(1);
});

test("create goal shows the same terms the rules package gives", async ({ page }) => {
  await signIn(page);
  await page.goto("/create");
  await page.getByRole("group", { name: "Window" }).getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("group", { name: "Value per day" }).getByRole("button", { name: "₹200" }).click();
  await expect(page.getByTestId("terms")).toContainText("0 (every miss costs ₹200)");
  await expect(page.getByTestId("terms")).toContainText("7 of 7 days");
  await expect(page.getByTestId("stake")).toHaveText("₹1,400");
  await page.getByRole("button", { name: "No Risk" }).click();
  await expect(page.getByRole("button", { name: /coming soon/ })).toBeDisabled();
});

test("the shoe scene follows the scroll", async ({ page }) => {
  await signIn(page);
  const story = page.getByTestId("story-steps");
  await story.scrollIntoViewIfNeeded();
  const count = story.locator(".readout b").first();
  const before = await count.textContent();
  await page.evaluate(() => window.scrollBy(0, 500));
  await expect.poll(async () => await count.textContent()).not.toBe(before);
  await page.evaluate(() => window.scrollBy(0, 1200));
  await expect(story.locator(".cap")).toContainText("₹100 moves from escrow");
});

test("No Risk page is clearly a preview", async ({ page }) => {
  await signIn(page);
  await page.goto("/norisk");
  await expect(page.getByText("PREVIEW").first()).toBeVisible();
  await expect(page.getByText("not built yet").first()).toBeVisible();
});
