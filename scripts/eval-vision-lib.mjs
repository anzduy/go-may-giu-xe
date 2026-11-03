// Tính điểm độ chính xác AI đọc ảnh (thuần, có unit test). Dùng bởi scripts/eval-vision.mjs.
import { normalizePlate } from '../web/shared/sessions.js';
import { compareAnalyses } from '../web/shared/compare.js';

export const TARGETS = { plateAccuracy: 0.8, colorDetect: 0.9, helmetDetect: 0.8, falseAlarm: 0.05 };

/**
 * labels: { photos: [{file, plate, color, helmetsOnVehicle, helmetsWorn}], pairs: [{in, out, expect: [kind...]}] }
 * predictions: { [file]: analysis } (kết quả parseVisionResponse().analysis)
 */
export function scoreEval(labels, predictions, threshold) {
  const withPlate = labels.photos.filter((p) => p.plate);
  const plateOk = withPlate.filter((p) => {
    const a = predictions[p.file];
    return a && a.plate && a.confidence.plate >= threshold && normalizePlate(a.plate) === normalizePlate(p.plate);
  }).length;
  const pairs = labels.pairs || [];
  const detect = (kind) => {
    const target = pairs.filter((x) => (x.expect || []).includes(kind));
    const hit = target.filter((x) => compareAnalyses(predictions[x.in], predictions[x.out], threshold, 0).some((a) => a.kind === kind));
    return { total: target.length, hit: hit.length, rate: target.length ? hit.length / target.length : null };
  };
  const clean = pairs.filter((x) => !(x.expect || []).length);
  const falseAlarms = clean.filter((x) => compareAnalyses(predictions[x.in], predictions[x.out], threshold, 0).length > 0);
  const r = {
    threshold,
    plateAccuracy: withPlate.length ? plateOk / withPlate.length : null,
    plateCount: withPlate.length,
    colorDetect: detect('color_mismatch'),
    helmetDetect: detect('helmet_missing'),
    falseAlarm: clean.length ? falseAlarms.length / clean.length : null,
    cleanPairs: clean.length,
  };
  r.pass = (r.plateAccuracy == null || r.plateAccuracy >= TARGETS.plateAccuracy)
    && (r.colorDetect.rate == null || r.colorDetect.rate >= TARGETS.colorDetect)
    && (r.helmetDetect.rate == null || r.helmetDetect.rate >= TARGETS.helmetDetect)
    && (r.falseAlarm == null || r.falseAlarm <= TARGETS.falseAlarm);
  return r;
}
