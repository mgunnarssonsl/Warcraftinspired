// Fog-of-war shading shared by every lit material. A small per-tile texture
// (1 = visible, ~0.45 = explored, ~0.06 = unexplored) is sampled by world X/Z
// in the fragment shader and multiplies the final colour, so terrain, trees,
// rocks and buildings all darken consistently. Linear filtering softens the
// tile edges.

import * as THREE from 'three';

export const fogUniforms = {
  fogMap: { value: null as THREE.Texture | null },
  fogSize: { value: new THREE.Vector2(1, 1) },
};

const patched = new WeakSet<THREE.Material>();

export function withFog<M extends THREE.Material>(m: M): M {
  if (patched.has(m)) return m;
  patched.add(m);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fogMap = fogUniforms.fogMap;
    shader.uniforms.fogSize = fogUniforms.fogSize;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fogWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWorld = instanceMatrix * fogWorld;
        #endif
        vFogXZ = (modelMatrix * fogWorld).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D fogMap;\nuniform vec2 fogSize;\nvarying vec2 vFogXZ;')
      .replace(
        '#include <dithering_fragment>',
        'gl_FragColor.rgb *= texture2D(fogMap, vFogXZ / fogSize).r;\n#include <dithering_fragment>',
      );
  };
  m.customProgramCacheKey = () => 'fog';
  m.needsUpdate = true;
  return m;
}

/** Per-tile fog values for one viewer, written into a texture each frame. */
export class FogTexture {
  readonly texture: THREE.DataTexture;
  private data: Uint8Array;

  constructor(w: number, h: number) {
    this.data = new Uint8Array(w * h);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
    fogUniforms.fogMap.value = this.texture;
    fogUniforms.fogSize.value.set(w, h);
  }

  update(visible: Uint8Array | null, explored: number[] | null): void {
    const d = this.data;
    for (let i = 0; i < d.length; i++) d[i] = !visible ? 255 : visible[i] ? 255 : explored && explored[i] ? 115 : 16;
    this.texture.needsUpdate = true;
  }
}
