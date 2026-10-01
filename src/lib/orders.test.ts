import { describe, it, expect } from 'vitest';
import { calculateOrderPricing, calculateWeightDiscrepancy } from './orders';
import { OrderItem } from '../types';

describe('Order & Pricing Calculations', () => {
  const sampleItems: OrderItem[] = [
    {
      productId: 'q1',
      name: 'Queso Chihuahua Selecto',
      price: 148.0,
      quantity: 2,
    },
    {
      productId: 'j1',
      name: 'Jamón York 1kg',
      price: 95.5,
      quantity: 1,
    },
  ];

  it('calculates standard subtotal and total with delivery fee and discounts', () => {
    const pricing = calculateOrderPricing(sampleItems, 50, 20);
    // Subtotal: (2 * 148.00) + (1 * 95.50) = 296 + 95.50 = 391.50
    // Total: 391.50 + 50 - 20 = 421.50
    expect(pricing.subtotal).toBe(391.5);
    expect(pricing.deliveryFee).toBe(50);
    expect(pricing.discount).toBe(20);
    expect(pricing.total).toBe(421.5);
  });

  it('adjusts total dynamically when preparer/loader weight is supplied', () => {
    const weightedItems: OrderItem[] = [
      {
        productId: 'q1',
        name: 'Queso Barra',
        price: 150.0,
        quantity: 1,
        approxWeight: 2.0, // initial estimated price = 300
        preparerWeight: 2.15, // actual weighed = 2.15 * 150 = 322.5
      },
    ];

    const pricing = calculateOrderPricing(weightedItems, 0, 0);
    expect(pricing.subtotal).toBe(322.5);
    expect(pricing.total).toBe(322.5);
  });

  describe('calculateWeightDiscrepancy', () => {
    it('detects variance exceeding threshold (>10%)', () => {
      const item: OrderItem = {
        productId: 'q1',
        name: 'Queso Barra',
        price: 100,
        quantity: 1,
        approxWeight: 2.0,
        preparerWeight: 2.3, // 15% difference
      };

      const result = calculateWeightDiscrepancy(item, 10);
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.diffPercentage).toBe(15);
      expect(result.varianceGrams).toBe(300);
    });

    it('tolerates minor acceptable weight variations (<=10%)', () => {
      const item: OrderItem = {
        productId: 'q1',
        name: 'Queso Barra',
        price: 100,
        quantity: 1,
        approxWeight: 2.0,
        preparerWeight: 2.05, // 2.5% difference
      };

      const result = calculateWeightDiscrepancy(item, 10);
      expect(result.hasDiscrepancy).toBe(false);
      expect(result.diffPercentage).toBe(2.5);
      expect(result.varianceGrams).toBe(50);
    });
  });
});
