// One-off verification: does lunarShadow()'s geometry agree with the vendor's own eclipse
// machinery, and does the shadow approach from the correct side (the Moon's eastern limb leads)?
// Run: node scripts/check-lunar-shadow.js
import { makeObserver, makeTime, Body, altAzOfBody, bodyAngularRadiusDeg, lunarShadow, searchLunarEclipse, nextLunarEclipse } from '../js/core/astro.js';
import { altazSepDeg } from '../js/core/moon.js';

const observer = makeObserver(29.76, -95.37);

let e = searchLunarEclipse(new Date('2026-01-01T00:00:00Z'));
while (e.kind !== 'total') e = nextLunarEclipse(e.peak);
console.log(`Total lunar eclipse, peak ${e.peak.toISOString()}`);
console.log(`Vendor contacts: partial ${e.contacts.partialBegin.toISOString()} .. ${e.contacts.partialEnd.toISOString()}`);

const sepAt = (d) => {
  const t = makeTime(d);
  const sh = lunarShadow(observer, t);
  const moon = altAzOfBody(Body.Moon, observer, t);
  return { sep: altazSepDeg(sh.altaz, moon), sh, moonRad: bodyAngularRadiusDeg(Body.Moon, observer, t) };
};

// 1) At the vendor's first/last umbral contact, our centre-to-centre separation should equal
//    umbraRadius + moonRadius (the discs touching) — the vendor never sees our shadow math.
for (const [name, d] of [['partialBegin', e.contacts.partialBegin], ['partialEnd', e.contacts.partialEnd]]) {
  const { sep, sh, moonRad } = sepAt(d);
  const expected = sh.umbraDeg + moonRad;
  console.log(`${name}: sep ${sep.toFixed(4)} vs umbra+moonRad ${expected.toFixed(4)} (err ${(sep - expected).toFixed(4)} deg)`);
}

// 2) Trajectory: separation should shrink to a minimum at the vendor's peak.
const peakMs = e.peak.getTime();
let minSep = Infinity, minOff = null;
for (let off = -120; off <= 120; off += 5) {
  const { sep } = sepAt(new Date(peakMs + off * 60000));
  if (sep < minSep) { minSep = sep; minOff = off; }
}
console.log(`min separation ${minSep.toFixed(4)} deg at peak${minOff >= 0 ? '+' : ''}${minOff} min (vendor peak = 0)`);

// 3) Direction: the Moon overtakes the slower-moving shadow from the west, so at first contact the
//    shadow centre must lie EAST of the Moon (greater apparent RA) — the eastern limb darkens first.
import('../js/vendor/astronomy.js').then((A) => {
  const t = makeTime(e.contacts.partialBegin);
  const moonEq = A.Equator(Body.Moon, t, observer, true, true);
  const sunEq = A.Equator(Body.Sun, t, observer, true, true);
  let dRa = ((sunEq.ra + 12) - moonEq.ra + 24) % 24; // anti-solar RA minus moon RA, wrapped
  if (dRa > 12) dRa -= 24;
  console.log(`shadow centre sits ${dRa >= 0 ? 'EAST' : 'WEST'} of the Moon at first contact (dRA ${(dRa * 15).toFixed(3)} deg)`);
});
