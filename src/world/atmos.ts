import * as THREE from "three";

// Time of day for both worlds. `tod` runs 0 (dusk, as in the clip at 6–10 s)
// → 1 (moonlit night, as at 26–28 s). Every lighting input — sky gradient,
// sun/moon, cloud light, ambient, fog, water — is keyframed here and pushed
// into shared uniforms (G) that all materials reference.

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
const rgb = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

type Key = {
  t: number;
  zenith: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color; // warm horizon glow toward the sun
  sunElev: number; // degrees
  sun: THREE.Color; // direct light radiance
  ambTop: THREE.Color;
  ambBottom: THREE.Color;
  cloudSun: THREE.Color;
  cloudFill: THREE.Color; // light inside / on the shadow side of clouds
  cloudAmbTop: THREE.Color;
  cloudAmbBottom: THREE.Color;
  fog: THREE.Color;
  bank: THREE.Color; // shadowed cloud bank right at the horizon
  water: THREE.Color;
  moon: number; // 0..1 moon strength
  stars: number;
  exposure: number;
};

const KEYS: Key[] = [
  {
    // Dusk: lavender zenith, peach horizon, sun low behind the viewer's left.
    t: 0,
    zenith: lin(66, 62, 112),
    mid: lin(128, 116, 168),
    horizon: lin(242, 178, 170),
    glow: lin(255, 196, 150),
    sunElev: 14,
    sun: rgb(1.12, 0.84, 0.6),
    ambTop: lin(165, 142, 205),
    ambBottom: lin(170, 112, 132),
    cloudSun: rgb(2.05, 1.5, 0.78),
    cloudFill: lin(218, 126, 96),
    cloudAmbTop: lin(150, 122, 156),
    cloudAmbBottom: lin(212, 124, 100),
    fog: lin(222, 160, 148),
    bank: lin(150, 98, 104),
    water: lin(104, 64, 100),
    moon: 0,
    stars: 0,
    exposure: 1,
  },
  {
    // Sun touching the cloud bank: everything warmer and pinker.
    t: 0.3,
    zenith: lin(56, 54, 108),
    mid: lin(118, 98, 160),
    horizon: lin(236, 150, 150),
    glow: lin(255, 150, 110),
    sunElev: 1.2,
    sun: rgb(1.1, 0.62, 0.42),
    ambTop: lin(120, 100, 170),
    ambBottom: lin(150, 92, 118),
    cloudSun: rgb(1.0, 0.56, 0.38),
    cloudFill: lin(176, 90, 84),
    cloudAmbTop: lin(118, 104, 170),
    cloudAmbBottom: lin(150, 92, 118),
    fog: lin(185, 125, 145),
    bank: lin(130, 82, 98),
    water: lin(58, 42, 72),
    moon: 0,
    stars: 0,
    exposure: 1.02,
  },
  {
    // Blue hour: afterglow at the horizon, the zenith already deep blue.
    t: 0.55,
    zenith: lin(26, 40, 88),
    mid: lin(52, 62, 118),
    horizon: lin(128, 96, 136),
    glow: lin(196, 120, 120),
    sunElev: -4,
    sun: rgb(0.0, 0.0, 0.0),
    ambTop: lin(52, 62, 118),
    ambBottom: lin(62, 52, 94),
    cloudSun: rgb(0.3, 0.16, 0.2),
    cloudFill: lin(52, 34, 62),
    cloudAmbTop: lin(52, 64, 124),
    cloudAmbBottom: lin(62, 56, 100),
    fog: lin(88, 80, 124),
    bank: lin(60, 52, 86),
    water: lin(24, 26, 56),
    moon: 0.3,
    stars: 0.35,
    exposure: 1.18,
  },
  {
    t: 0.8,
    zenith: lin(14, 38, 74),
    mid: lin(16, 38, 70),
    horizon: lin(22, 40, 74),
    glow: lin(40, 50, 90),
    sunElev: -10,
    sun: rgb(0, 0, 0),
    ambTop: lin(22, 40, 82),
    ambBottom: lin(14, 22, 48),
    cloudSun: rgb(0, 0, 0),
    cloudFill: lin(8, 16, 34),
    cloudAmbTop: lin(28, 56, 100),
    cloudAmbBottom: lin(10, 22, 48),
    fog: lin(24, 42, 76),
    bank: lin(12, 24, 48),
    water: lin(8, 16, 36),
    moon: 0.85,
    stars: 0.9,
    exposure: 1.3,
  },
  {
    // Moonlit night (clip 27 s): navy sky, slightly darker toward the horizon.
    t: 1,
    zenith: lin(14, 42, 78),
    mid: lin(14, 38, 66),
    horizon: lin(10, 28, 54),
    glow: lin(18, 34, 64),
    sunElev: -14,
    sun: rgb(0, 0, 0),
    ambTop: lin(22, 44, 88),
    ambBottom: lin(10, 20, 44),
    cloudSun: rgb(0, 0, 0),
    cloudFill: lin(8, 16, 34),
    cloudAmbTop: lin(28, 58, 104),
    cloudAmbBottom: lin(10, 22, 48),
    fog: lin(16, 34, 64),
    bank: lin(8, 20, 42),
    water: lin(6, 14, 32),
    moon: 1,
    stars: 1,
    exposure: 1.32,
  },
];

const v3 = () => ({ value: new THREE.Vector3() });
const c3 = () => ({ value: new THREE.Color() });
const f1 = (v = 0) => ({ value: v });

// Shared uniforms. Materials put these objects straight into their uniform
// maps, so one write here updates everything.
export const G = {
  uTime: f1(),
  uSunDir: v3(),
  uSunColor: c3(),
  uMoonDir: v3(),
  uMoonColor: c3(),
  uMoon: f1(),
  uZenith: c3(),
  uMid: c3(),
  uHorizon: c3(),
  uGlow: c3(),
  uAmbTop: c3(),
  uAmbBottom: c3(),
  uCloudSun: c3(),
  uCloudFill: c3(),
  uCloudDetail: f1(1),
  uCloudAmbTop: c3(),
  uCloudAmbBottom: c3(),
  uFogColor: c3(),
  uHorizonBank: c3(),
  uWaterColor: c3(),
  uStars: f1(),
  uCityGlow: { value: new THREE.Color(0, 0, 0) }, // warm light from below (World B), 0 in World A
  uCamPos: v3(),
  uRes: { value: new THREE.Vector2(1, 1) },
};

export type AtmosExtra = {
  exposure: number;
};

const tmp = new THREE.Color();
const sunAzimuth = THREE.MathUtils.degToRad(-104); // low on the left, slightly behind
const moonAz = THREE.MathUtils.degToRad(24);
const moonEl = THREE.MathUtils.degToRad(27);

function dirFromAzEl(az: number, el: number, out: THREE.Vector3) {
  // az measured from -Z (the view direction toward the torii), positive to the right (+X).
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export const moonDirection = dirFromAzEl(moonAz, moonEl, new THREE.Vector3());

export function applyAtmos(tod: number, out: AtmosExtra, moonDir: THREE.Vector3 = moonDirection) {
  const t = THREE.MathUtils.clamp(tod, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const x = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const mixC = (u: { value: THREE.Color }, k: keyof Key) => u.value.copy(a[k] as THREE.Color).lerp(b[k] as THREE.Color, x);
  mixC(G.uZenith, "zenith");
  mixC(G.uMid, "mid");
  mixC(G.uHorizon, "horizon");
  mixC(G.uGlow, "glow");
  mixC(G.uSunColor, "sun");
  mixC(G.uAmbTop, "ambTop");
  mixC(G.uAmbBottom, "ambBottom");
  mixC(G.uCloudSun, "cloudSun");
  mixC(G.uCloudFill, "cloudFill");
  mixC(G.uCloudAmbTop, "cloudAmbTop");
  mixC(G.uCloudAmbBottom, "cloudAmbBottom");
  mixC(G.uFogColor, "fog");
  mixC(G.uHorizonBank, "bank");
  mixC(G.uWaterColor, "water");
  const elev = THREE.MathUtils.lerp(a.sunElev, b.sunElev, x);
  dirFromAzEl(sunAzimuth, THREE.MathUtils.degToRad(elev), G.uSunDir.value);
  const moon = THREE.MathUtils.lerp(a.moon, b.moon, x);
  G.uMoon.value = moon;
  G.uMoonDir.value.copy(moonDir);
  G.uMoonColor.value.copy(tmp.setRGB(0.36, 0.44, 0.62)).multiplyScalar(moon);
  G.uStars.value = THREE.MathUtils.lerp(a.stars, b.stars, x);
  // Night clouds read as calm masses: less fine erosion.
  G.uCloudDetail.value = 1 - 0.75 * THREE.MathUtils.smoothstep(t, 0.5, 0.95);
  out.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, x);
}
