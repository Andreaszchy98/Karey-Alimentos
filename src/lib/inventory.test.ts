import { describe, it, expect } from 'vitest';
import {
  validateStockAvailability,
  calculateOrderStatusInventoryDelta,
  processReturnStockResolution,
  calculateWasteLossValue,
} from './inventory';

describe('Inventory Domain Logic & Overselling Protection', () => {
  describe('validateStockAvailability', () => {
    const product = {
      name: 'Jamón York Extra 1kg',
      stock: 50,
      reserved: 10, // Available: 40
    };

    it('allows purchases within available stock threshold', () => {
      const result = validateStockAvailability(product, 25);
      expect(result.isValid).toBe(true);
      expect(result.availableStock).toBe(40);
      expect(result.message).toBeUndefined();
    });

    it('allows purchasing the exact remaining available stock', () => {
      const result = validateStockAvailability(product, 40);
      expect(result.isValid).toBe(true);
      expect(result.availableStock).toBe(40);
    });

    it('rejects order when requested quantity exceeds available stock (prevents overselling)', () => {
      const result = validateStockAvailability(product, 45);
      expect(result.isValid).toBe(false);
      expect(result.availableStock).toBe(40);
      expect(result.message).toContain('Stock insuficiente');
    });

    it('rejects invalid non-positive quantities', () => {
      const result = validateStockAvailability(product, 0);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('mayor a cero');
    });
  });

  describe('calculateOrderStatusInventoryDelta', () => {
    it('increases reservation when order is accepted/processing', () => {
      const delta = calculateOrderStatusInventoryDelta('pending', 'accepted', 5);
      expect(delta.reservedDelta).toBe(5);
      expect(delta.stockDelta).toBe(0);
    });

    it('deducts physical stock and clears reservation when delivered', () => {
      const delta = calculateOrderStatusInventoryDelta('shipped', 'delivered', 5);
      expect(delta.reservedDelta).toBe(-5);
      expect(delta.stockDelta).toBe(-5);
    });

    it('releases reserved stock without deducting physical stock when cancelled', () => {
      const delta = calculateOrderStatusInventoryDelta('accepted', 'cancelled', 5);
      expect(delta.reservedDelta).toBe(-5);
      expect(delta.stockDelta).toBe(0);
    });
  });

  describe('processReturnStockResolution', () => {
    it('restocks items into physical inventory when approved as good stock', () => {
      const { newStock, wasteUnits } = processReturnStockResolution(50, 5, 'stock');
      expect(newStock).toBe(55);
      expect(wasteUnits).toBe(0);
    });

    it('records waste and leaves salable stock intact when item is spoiled/damaged', () => {
      const { newStock, wasteUnits } = processReturnStockResolution(50, 5, 'waste');
      expect(newStock).toBe(50);
      expect(wasteUnits).toBe(5);
    });

    it('does not alter inventory when resolution is none', () => {
      const { newStock, wasteUnits } = processReturnStockResolution(50, 5, 'none');
      expect(newStock).toBe(50);
      expect(wasteUnits).toBe(0);
    });
  });

  describe('calculateWasteLossValue', () => {
    it('accurately computes financial loss from shrinkage/merma', () => {
      const loss = calculateWasteLossValue(148.5, 3.5);
      expect(loss).toBe(519.75);
    });

    it('handles zero or negative values safely', () => {
      expect(calculateWasteLossValue(0, 10)).toBe(0);
      expect(calculateWasteLossValue(100, -2)).toBe(0);
    });
  });
});
