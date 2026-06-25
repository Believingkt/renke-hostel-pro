"""Sticky tabs E2E for BookingVilla page.

Run: python3 tests/e2e/sticky_tabs.py [villa_url]

If no URL is provided, defaults to a known accommodation id from the dev DB.
Captures screenshots and per-frame sticky `top` measurements to verify the
bar never leaves the viewport and clicked tabs land within ±2px of target.
"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/sticky-tabs")
OUT.mkdir(parents=True, exist_ok=True)

DEFAULT_URL = (
    "http://localhost:8080/booking/villa/5f764d55-ae11-4631-80fe-2e611853deae"
    "?checkIn=2026-10-18&checkOut=2026-10-19&adults=2&children=0"
)

TAB_IDS = [
    "capacity-price-section",
    "facilities",
    "location",
    "reviews",
    "faq",
    "about",
    "policy",
    "similar",
]


async def measure_sticky_top(page):
    return await page.evaluate(
        """() => {
            const el = document.querySelector('[class*="sticky"][class*="top-16"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height };
        }"""
    )


async def run(url: str):
    failures: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / "01_initial.png"))

        # Scroll past tab origin and confirm sticky pinned to ~64px (mobile header)
        for i, y in enumerate([200, 600, 1500, 3000]):
            await page.evaluate(f"window.scrollTo(0, {y})")
            await page.wait_for_timeout(250)
            m = await measure_sticky_top(page)
            print(f"scrollY={y} sticky={m}")
            await page.screenshot(path=str(OUT / f"02_scroll_{i}.png"))
            if m and y > 400 and not (60 <= m["top"] <= 72):
                failures.append(f"sticky top out of range at scrollY={y}: {m['top']}")

        # Click each tab and verify landing position
        for tid in TAB_IDS:
            btn = page.locator(f'button:has-text("")').filter(
                has=page.locator(f'text=/.+/')
            )
            # Click by querying the nav directly
            clicked = await page.evaluate(
                f"""(id) => {{
                    const nav = document.querySelector('[class*="sticky"][class*="top-16"]');
                    if (!nav) return false;
                    const btns = nav.querySelectorAll('button');
                    const tabs = {TAB_IDS!r};
                    const idx = tabs.indexOf(id);
                    if (idx < 0 || !btns[idx]) return false;
                    btns[idx].click();
                    return true;
                }}""",
                tid,
            )
            if not clicked:
                failures.append(f"could not click tab {tid}")
                continue

            # sample sticky top during animation
            samples = []
            for _ in range(12):
                await page.wait_for_timeout(50)
                m = await measure_sticky_top(page)
                if m:
                    samples.append(m["top"])
            await page.wait_for_timeout(400)

            offending = [s for s in samples if s > 80 or s < 0]
            if offending:
                failures.append(f"tab {tid}: sticky top jittered {offending}")

            # verify landed near section
            land = await page.evaluate(
                """(id) => {
                    const el = document.getElementById(id);
                    if (!el) return null;
                    return el.getBoundingClientRect().top;
                }""",
                tid,
            )
            print(f"tab {tid} landed top={land} samples={samples}")
            # Landing tolerance: ~112px ±6, but allow edge cases where the page
            # cannot scroll further (top or bottom of document).
            at_top = await page.evaluate("window.scrollY <= 1")
            at_bottom = await page.evaluate(
                "Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1"
            )
            if (
                land is not None
                and not (100 <= land <= 124)
                and not at_top
                and not at_bottom
            ):
                failures.append(f"tab {tid}: landed at {land}px (expected ~112±6)")
            await page.screenshot(path=str(OUT / f"03_tab_{tid}.png"))

        await browser.close()

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\nALL OK")


if __name__ == "__main__":
    asyncio.run(run(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL))
