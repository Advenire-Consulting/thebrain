const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeTemporalProximity, getFileFreshness } = require('../lib/dir-loader');

describe('trust scoring integration', () => {
  it('recent chunk with existing files scores high', () => {
    const temporal = computeTemporalProximity(Date.now(), Date.now());
    const freshness = getFileFreshness(__filename, Date.now() + 100000);
    const combined = temporal * freshness;
    assert.ok(combined >= 0.9);
  });

  it('old chunk with missing files scores low', () => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const temporal = computeTemporalProximity(thirtyDaysAgo, Date.now());
    const freshness = getFileFreshness('/tmp/definitely-gone.js', thirtyDaysAgo);
    const combined = temporal * freshness;
    assert.ok(combined < 0.15);
  });

  it('anchor shift changes trust distribution', () => {
    const now = Date.now();
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    const scoreFromNow = computeTemporalProximity(twoWeeksAgo, now);
    const scoreFromAnchor = computeTemporalProximity(twoWeeksAgo, twoWeeksAgo);

    assert.ok(scoreFromAnchor > scoreFromNow);
    assert.equal(scoreFromAnchor, 1.0);
  });
});
