import { describe, it, expect } from 'vitest';
import {
  isRevenueOrder,
  orderNights,
  accrueOrderNightlyShares,
  totalAccruedRevenue,
  inRangeNightFraction,
  accrueOrderAmount,
} from './revenueAccrual';

const d = (s: string) => {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
};

describe('isRevenueOrder', () => {
  it('excludes cancelled orders', () => {
    expect(isRevenueOrder({ order_status: 'cancelled', order_source: 'direct' })).toBe(false);
  });
  it('excludes KOL orders regardless of status', () => {
    expect(isRevenueOrder({ order_status: 'confirmed', order_source: 'kol' })).toBe(false);
    expect(isRevenueOrder({ order_status: 'pending', order_source: 'kol' })).toBe(false);
  });
  it('includes pending / hold / confirmed / checked_out from non-KOL sources', () => {
    for (const s of ['pending', 'hold', 'confirmed', 'checked_out', null, undefined]) {
      expect(isRevenueOrder({ order_status: s as any, order_source: 'direct' })).toBe(true);
    }
  });
});

describe('orderNights', () => {
  it('counts nights between check_in and check_out', () => {
    expect(orderNights({ check_in_date: '2025-08-10', check_out_date: '2025-08-13' })).toBe(3);
  });
  it('returns 0 for same-day or missing dates', () => {
    expect(orderNights({ check_in_date: '2025-08-10', check_out_date: '2025-08-10' })).toBe(0);
    expect(orderNights({})).toBe(0);
  });
});

describe('accrueOrderNightlyShares', () => {
  const order = {
    order_status: 'confirmed',
    order_source: 'direct',
    check_in_date: '2025-08-30',
    check_out_date: '2025-09-02',
    final_price: 3000,
  };

  it('splits final_price evenly per night', () => {
    const shares = accrueOrderNightlyShares(order);
    expect(shares).toHaveLength(3);
    expect(shares.map((s) => s.date)).toEqual(['2025-08-30', '2025-08-31', '2025-09-01']);
    for (const s of shares) expect(s.amount).toBeCloseTo(1000, 6);
  });

  it('clips to the requested window (cross-month)', () => {
    const aug = accrueOrderNightlyShares(order, d('2025-08-01'), d('2025-08-31'));
    expect(aug).toHaveLength(2);
    expect(aug.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(2000, 6);

    const sep = accrueOrderNightlyShares(order, d('2025-09-01'), d('2025-09-30'));
    expect(sep).toHaveLength(1);
    expect(sep.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(1000, 6);
  });

  it('returns [] for cancelled and KOL orders', () => {
    expect(accrueOrderNightlyShares({ ...order, order_status: 'cancelled' })).toEqual([]);
    expect(accrueOrderNightlyShares({ ...order, order_source: 'kol' })).toEqual([]);
  });
});

describe('totalAccruedRevenue', () => {
  const orders = [
    // Single-night confirmed inside window
    { order_status: 'confirmed', order_source: 'direct', check_in_date: '2025-08-10', check_out_date: '2025-08-11', final_price: 5000 },
    // Cross-month, 3 nights, 2 in Aug + 1 in Sep
    { order_status: 'pending', order_source: 'direct', check_in_date: '2025-08-30', check_out_date: '2025-09-02', final_price: 3000 },
    // KOL — excluded
    { order_status: 'confirmed', order_source: 'kol', check_in_date: '2025-08-15', check_out_date: '2025-08-16', final_price: 9999 },
    // Cancelled — excluded
    { order_status: 'cancelled', order_source: 'direct', check_in_date: '2025-08-20', check_out_date: '2025-08-21', final_price: 9999 },
  ];

  it('sums nightly shares only for billable orders inside the window', () => {
    const aug = totalAccruedRevenue(orders, d('2025-08-01'), d('2025-08-31'));
    // 5000 (1 night in Aug) + 2000 (2 of 3 nights in Aug) = 7000
    expect(aug).toBeCloseTo(7000, 6);

    const sep = totalAccruedRevenue(orders, d('2025-09-01'), d('2025-09-30'));
    expect(sep).toBeCloseTo(1000, 6);
  });

  it('equals sum of per-order full accrual with no window', () => {
    expect(totalAccruedRevenue(orders)).toBeCloseTo(5000 + 3000, 6);
  });

  it('is additive: totalAccruedRevenue(A ∪ B, w) === total(A,w) + total(B,w)', () => {
    const w1 = d('2025-08-01');
    const w2 = d('2025-09-30');
    const a = orders.slice(0, 2);
    const b = orders.slice(2);
    expect(totalAccruedRevenue([...a, ...b], w1, w2)).toBeCloseTo(
      totalAccruedRevenue(a, w1, w2) + totalAccruedRevenue(b, w1, w2),
      6,
    );
  });
});

describe('inRangeNightFraction & accrueOrderAmount', () => {
  const o = {
    order_status: 'confirmed',
    order_source: 'direct',
    check_in_date: '2025-08-30',
    check_out_date: '2025-09-02',
    final_price: 3000,
  };

  it('reports the fraction of nights that fall in the window', () => {
    expect(inRangeNightFraction(o, d('2025-08-01'), d('2025-08-31'))).toBeCloseTo(2 / 3, 6);
    expect(inRangeNightFraction(o, d('2025-09-01'), d('2025-09-30'))).toBeCloseTo(1 / 3, 6);
  });

  it('pro-rates arbitrary amounts with the same fraction', () => {
    expect(accrueOrderAmount(o, 1500, d('2025-08-01'), d('2025-08-31'))).toBeCloseTo(1000, 6);
    expect(accrueOrderAmount(o, 1500, d('2025-09-01'), d('2025-09-30'))).toBeCloseTo(500, 6);
  });

  it('returns 0 for excluded orders', () => {
    expect(inRangeNightFraction({ ...o, order_source: 'kol' })).toBe(0);
    expect(accrueOrderAmount({ ...o, order_status: 'cancelled' }, 1500)).toBe(0);
  });
});
