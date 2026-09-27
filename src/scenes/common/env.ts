import * as THREE from "three";
import { env } from "../../engine/toon";

// Every toon material shares one set of lighting uniforms (engine/toon.ts).
// Each scene owns a snapshot of values; the host copies it in before that
// scene renders, so two scenes can light differently in the same frame.

export type EnvValues = {
  /** Toward the moon: rim light, fog glow, sky. */
  moonDir: THREE.Vector3;
  /** Stylised key light for the two-tone terminator. */
  keyDir: THREE.Vector3;
  skyAmb: THREE.Color;
  groundAmb: THREE.Color;
  rimCol: THREE.Color;
  fogCol: THREE.Color;
  fogMoon: THREE.Color;
  /** start (m), end (m), max amount */
  fogDist: THREE.Vector3;
  /** One strong coloured point light (xyz, radius). */
  poleLight: THREE.Vector4;
  poleCol: THREE.Color;
  /** Four banded warm point lights (xyz, radius). */
  lamps: THREE.Vector4[];
  lampCols: THREE.Color[];
  wind: THREE.Vector3;
};

export function makeEnv(o: Partial<EnvValues> = {}): EnvValues {
  const lamps = o.lamps ?? [];
  const cols = o.lampCols ?? [];
  return {
    moonDir: (o.moonDir ?? new THREE.Vector3(0.16, 0.12, -1)).clone().normalize(),
    keyDir: (o.keyDir ?? new THREE.Vector3(-0.08, 1.0, -0.85)).clone().normalize(),
    skyAmb: o.skyAmb ?? new THREE.Color(1, 1, 1),
    groundAmb: o.groundAmb ?? new THREE.Color(0.86, 0.88, 0.96),
    rimCol: o.rimCol ?? new THREE.Color(0.55, 0.72, 1.0),
    fogCol: o.fogCol ?? new THREE.Color(0.07, 0.15, 0.38),
    fogMoon: o.fogMoon ?? new THREE.Color(0.16, 0.28, 0.62),
    fogDist: o.fogDist ?? new THREE.Vector3(350, 9000, 0.78),
    poleLight: o.poleLight ?? new THREE.Vector4(0, -1e4, 0, 0.001),
    poleCol: o.poleCol ?? new THREE.Color(0, 0, 0),
    lamps: [0, 1, 2, 3].map((i) => lamps[i]?.clone() ?? new THREE.Vector4(0, -1e4, 0, 0.001)),
    lampCols: [0, 1, 2, 3].map((i) => cols[i]?.clone() ?? new THREE.Color(0, 0, 0)),
    wind: o.wind ?? new THREE.Vector3(1, 0, 0.3),
  };
}

/** Copy a scene's lighting into the shared toon uniforms. */
export function applyEnv(e: EnvValues) {
  env.uMoonDir.value.copy(e.moonDir);
  env.uKeyDir.value.copy(e.keyDir);
  env.uSkyAmb.value.copy(e.skyAmb);
  env.uGroundAmb.value.copy(e.groundAmb);
  env.uRimCol.value.copy(e.rimCol);
  env.uFogCol.value.copy(e.fogCol);
  env.uFogMoon.value.copy(e.fogMoon);
  env.uFogDist.value.copy(e.fogDist);
  env.uPoleLight.value.copy(e.poleLight);
  env.uPoleCol.value.copy(e.poleCol);
  for (let i = 0; i < 4; i++) {
    env.uLamps.value[i].copy(e.lamps[i]);
    env.uLampCols.value[i].copy(e.lampCols[i]);
  }
  env.uWind.value.copy(e.wind);
}

/** A direction from azimuth (deg, 0 = −z, + toward +x) and elevation (deg). */
export function dirFromAzEl(azDeg: number, elDeg: number) {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}
