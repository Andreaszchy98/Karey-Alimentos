import { describe, it, expect } from 'vitest';
import { calculateStraightDistance } from './osm';
import { sortOrdersByWindowAndDistance } from './utils';
import { Order } from '../types';

describe('Routing & Delivery Logistics', () => {
  it('calculates Haversine straight-line distance in kilometers', () => {
    // Mazatlán Centro (23.2185, -106.4215) to Zona Dorada (23.2425, -106.4468) ~3.7-4.0 km
    const dist = calculateStraightDistance(23.2185, -106.4215, 23.2425, -106.4468);
    expect(dist).toBeGreaterThan(3.0);
    expect(dist).toBeLessThan(5.0);
  });

  it('sorts orders prioritizing earlier delivery windows first, then proximity', () => {
    const orders: Partial<Order>[] = [
      {
        id: 'ord-late',
        deliveryWindowStart: '14:00',
        deliveryWindowEnd: '16:00',
        location: { lat: 23.2200, lng: -106.4200 },
      },
      {
        id: 'ord-early-far',
        deliveryWindowStart: '09:00',
        deliveryWindowEnd: '11:00',
        location: { lat: 23.2900, lng: -106.5000 },
      },
      {
        id: 'ord-early-close',
        deliveryWindowStart: '09:00',
        deliveryWindowEnd: '11:00',
        location: { lat: 23.2205, lng: -106.4205 },
      },
      {
        id: 'ord-no-window',
        location: { lat: 23.2210, lng: -106.4210 },
      },
    ];

    const currentLoc = { lat: 23.2200, lng: -106.4200 };
    const sorted = sortOrdersByWindowAndDistance(orders as Order[], currentLoc);

    // ord-early-close should come first (earliest window + closest)
    // ord-early-far second (earliest window, but further)
    // ord-late third (afternoon window)
    // ord-no-window last (no window specified)
    expect(sorted[0].id).toBe('ord-early-close');
    expect(sorted[1].id).toBe('ord-early-far');
    expect(sorted[2].id).toBe('ord-late');
    expect(sorted[3].id).toBe('ord-no-window');
  });
});
