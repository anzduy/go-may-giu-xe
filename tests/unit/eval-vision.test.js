import { describe, it, expect } from 'vitest';
import { scoreEval } from '../../scripts/eval-vision-lib.mjs';

const A = (over) => ({ plate: '', color: 'đỏ', helmetsOnVehicle: 2, helmetsWorn: 0, otherItems: [], confidence: { plate: 0, color: 0.9, helmets: 0.9 }, ...over });
const labels = {
  photos: [{ file: 'a_in', plate: '59X1-123.45' }, { file: 'a_out', plate: '59X1-123.45' }, { file: 'b_in', plate: '' }, { file: 'b_out', plate: '' }, { file: 'c_out', plate: '' }],
  pairs: [{ in: 'a_in', out: 'a_out', expect: ['helmet_missing'] }, { in: 'b_in', out: 'b_out', expect: [] }, { in: 'a_in', out: 'c_out', expect: ['color_mismatch'] }],
};

describe('tính điểm bộ đo độ chính xác AI', () => {
  it('đủ mục tiêu → pass', () => {
    const pred = {
      a_in: A({ plate: '59X1-123.45', confidence: { plate: 0.9, color: 0.9, helmets: 0.9 } }),
      a_out: A({ plate: '59X112345', helmetsOnVehicle: 1, confidence: { plate: 0.9, color: 0.9, helmets: 0.9 } }),
      b_in: A({}), b_out: A({}), c_out: A({ color: 'xanh dương' }),
    };
    const r = scoreEval(labels, pred, 0.7);
    expect(r).toMatchObject({ plateAccuracy: 1, falseAlarm: 0, pass: true });
    expect(r.helmetDetect).toMatchObject({ total: 1, hit: 1 });
    expect(r.colorDetect).toMatchObject({ total: 1, hit: 1 });
  });
  it('báo sai ở cặp không đổi → không đạt', () => {
    const pred = { a_in: A({}), a_out: A({ helmetsOnVehicle: 1 }), b_in: A({}), b_out: A({ helmetsOnVehicle: 0 }), c_out: A({ color: 'đen' }) };
    const r = scoreEval(labels, pred, 0.7);
    expect(r.falseAlarm).toBe(1);
    expect(r.plateAccuracy).toBe(0);
    expect(r.pass).toBe(false);
  });
});
