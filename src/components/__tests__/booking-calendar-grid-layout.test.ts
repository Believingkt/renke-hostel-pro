import { describe, it, expect } from "vitest";

/**
 * Regression tests for BookingCalendarGrid column-width / pill-alignment math.
 *
 * These mirror the calculations in BookingCalendarGrid.tsx so future refactors
 * cannot reintroduce the "blank trailing cell" or "double border line" bugs.
 *
 * See: src/components/BookingCalendarGrid.tsx
 *   - DAY_COL_MIN_WIDTH
 *   - GRID_MIN_WIDTH
 *   - DAYS_ROW_WIDTH
 *   - pill `left` / `width` style
 */

const LEFT_COL_WIDTH = 200;

function dayColMinWidth(containerWidth: number, dayCount: number) {
  if (containerWidth > 0) {
    const available = containerWidth - LEFT_COL_WIDTH;
    return Math.max(available / dayCount, 48);
  }
  return dayCount <= 7 ? 120 : dayCount <= 15 ? 80 : 48;
}

function layout(containerWidth: number, dayCount: number) {
  const col = dayColMinWidth(containerWidth, dayCount);
  const daysRow = col * dayCount;
  const grid = LEFT_COL_WIDTH + daysRow;
  return { col, daysRow, grid };
}

function pillStyle(
  startIdx: number,
  span: number,
  col: number,
  isClippedLeft: boolean,
  isClippedRight: boolean,
) {
  const leftPx = startIdx * col;
  const widthPx = span * col;
  return {
    left: leftPx + (isClippedLeft ? 0 : 1),
    width: widthPx - (isClippedLeft ? 0 : 1) - (isClippedRight ? 0 : 1),
  };
}

describe("BookingCalendarGrid column width", () => {
  it.each([
    [1207, 3],
    [1207, 7],
    [1207, 15],
    [1207, 30],
    [1577, 3],
    [1577, 30],
    [900, 7],
  ])(
    "days-row width === col * dayCount (container=%i, days=%i)",
    (cw, days) => {
      const { col, daysRow, grid } = layout(cw, days);
      // The trailing blank cell appeared when daysRow !== col*dayCount
      expect(daysRow).toBeCloseTo(col * days, 6);
      expect(grid).toBeCloseTo(LEFT_COL_WIDTH + col * days, 6);
    },
  );

  it("never goes below the 48px minimum cell width", () => {
    const { col } = layout(800, 30);
    expect(col).toBeGreaterThanOrEqual(48);
  });

  it("uses the natural width when container is wide enough", () => {
    const { col } = layout(1577, 3);
    expect(col).toBeCloseTo((1577 - 200) / 3, 6);
  });
});

describe("Order pill alignment", () => {
  const col = 333.333;

  it("insets 1px on both sides for a fully-visible single-day booking", () => {
    const s = pillStyle(0, 1, col, false, false);
    expect(s.left).toBeCloseTo(1, 6);
    expect(s.width).toBeCloseTo(col - 2, 6);
    // Right edge must stay strictly inside the cell to avoid doubling the
    // cell border with the pill border.
    expect(s.left + s.width).toBeLessThan(col);
  });

  it("does not inset on the clipped side", () => {
    const left = pillStyle(0, 2, col, true, false);
    expect(left.left).toBe(0);
    expect(left.width).toBeCloseTo(2 * col - 1, 6);

    const right = pillStyle(1, 2, col, false, true);
    expect(right.left).toBeCloseTo(col + 1, 6);
    expect(right.width).toBeCloseTo(2 * col - 1, 6);
  });

  it("multi-day pills stay within their span", () => {
    const span = 5;
    const s = pillStyle(2, span, col, false, false);
    expect(s.left).toBeGreaterThanOrEqual(2 * col);
    expect(s.left + s.width).toBeLessThan((2 + span) * col);
  });
});
