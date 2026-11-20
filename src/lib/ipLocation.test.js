import { describe, expect, it } from 'vitest';
import { normalizeLocation, placeLabel } from './ipLocation';

describe('normalizeLocation', () => {
  it('accepts a located answer', () => {
    expect(
      normalizeLocation({ located: true, city: 'Houston', region: 'TX', lat: 29.76, lng: -95.37 })
    ).toEqual({ city: 'Houston', region: 'TX', lat: 29.76, lng: -95.37 });
  });

  it('keeps a place that has coordinates but no city or region', () => {
    expect(normalizeLocation({ located: true, city: null, region: '  ', lat: 31, lng: -100 })).toEqual({
      city: null,
      region: null,
      lat: 31,
      lng: -100,
    });
  });

  it('rejects anything that is not a usable located answer', () => {
    expect(normalizeLocation(null)).toBeNull();
    expect(normalizeLocation({ located: false })).toBeNull();
    expect(normalizeLocation({ located: true, lat: 'x', lng: 1 })).toBeNull();
    expect(normalizeLocation({ located: true, lat: 91, lng: 1 })).toBeNull();
    expect(normalizeLocation({ located: true, lat: 1, lng: -181 })).toBeNull();
    expect(normalizeLocation({ located: true })).toBeNull();
  });
});

describe('placeLabel', () => {
  it('joins city and region', () => {
    expect(placeLabel({ city: 'Houston', region: 'TX' })).toBe('Houston, TX');
  });

  it('falls back to whatever is there', () => {
    expect(placeLabel({ city: 'Houston', region: null })).toBe('Houston');
    expect(placeLabel({ city: null, region: 'Texas' })).toBe('Texas');
    expect(placeLabel({ city: null, region: null })).toBe('your area');
    expect(placeLabel(null)).toBe('your area');
  });
});
