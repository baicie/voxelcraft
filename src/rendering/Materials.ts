import * as THREE from 'three';
import type { TextureAtlas } from './TextureAtlas';

export interface ChunkMaterialSet {
  readonly opaque: THREE.MeshLambertMaterial;
  readonly cutout: THREE.MeshLambertMaterial;
  readonly transparent: THREE.MeshLambertMaterial;
  dispose(): void;
}

export function createChunkMaterials(atlas: TextureAtlas): ChunkMaterialSet {
  const opaque = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: atlas.texture,
    emissiveIntensity: 0.18,
    fog: true,
  });
  opaque.name = 'chunk-opaque';

  const cutout = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x14210d),
    emissiveIntensity: 0.65,
    fog: true,
  });
  cutout.name = 'chunk-cutout';

  const transparent = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    fog: true,
  });
  transparent.name = 'chunk-transparent';

  return {
    opaque,
    cutout,
    transparent,
    dispose(): void {
      opaque.dispose();
      cutout.dispose();
      transparent.dispose();
    },
  };
}
