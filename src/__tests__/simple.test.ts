// src/__tests__/simple.test.ts
import { describe, it, expect } from '@jest/globals';

describe('シンプルテスト', () => {
  it('基本的な数学演算が動作する', () => {
    expect(2 + 2).toBe(4);
  });

  it('文字列操作が動作する', () => {
    const text = 'Hello JST';
    expect(text.includes('JST')).toBe(true);
  });

  it('配列操作が動作する', () => {
    const mappings = [
      { sensor_type: 'ahtTemp', offset: 0.5 },
      { sensor_type: 'ahtHum', offset: 0.0 }
    ];
    expect(mappings).toHaveLength(2);
    expect(mappings[0].sensor_type).toBe('ahtTemp');
  });
});