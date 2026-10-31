import * as THREE from 'three';
import { clamp, lerp } from '../core/math';

const skyVertex = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFragment = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float daylight;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
  vec3 dir = normalize(vDir);
  float h = smoothstep(-0.12, 0.7, dir.y);
  vec3 color = mix(horizon, zenith, h);
  float glow = pow(max(dot(dir, normalize(sunDir)), 0.0), 18.0);
  color += sunColor * glow * (0.15 + daylight * 0.9);
  float disk = smoothstep(0.9992, 0.9997, dot(dir, normalize(sunDir)));
  color = mix(color, vec3(1.0, 0.92, 0.68), disk * daylight);
  float star = step(0.9985, hash(floor(dir.xz * 850.0 + dir.y * 390.0))) * (1.0 - daylight);
  color += vec3(0.85, 0.9, 1.0) * star * 0.85;
  gl_FragColor = vec4(color, 1.0);
}`;

export class SkySystem {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xfff3d6, 1.8);
  readonly hemi = new THREE.HemisphereLight(0xa9d6ff, 0x5b4931, 1.1);
  private dome: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;
  private clouds: THREE.InstancedMesh;
  private cloudData: { x: number; y: number; z: number; s: number }[] = [];
  private timeOfDay = 0.16;
  readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.uniforms = {
      zenith: { value: new THREE.Color('#5c9bd9') },
      horizon: { value: new THREE.Color('#d8edf2') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#ffcf85') },
      daylight: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVertex, fragmentShader: skyFragment,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 16), material);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    scene.add(this.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -48; this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48; this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 180;
    this.sun.shadow.bias = -0.00008;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.FogExp2('#aac9d8', 0.0115);
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.54, depthWrite: false });
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloudMaterial, 36);
    this.clouds.castShadow = false;
    this.group.add(this.clouds);
    for (let i = 0; i < 36; i++) this.cloudData.push({
      x: (i * 47 % 300) - 150, y: 74 + (i % 4) * 2.3, z: (i * 83 % 300) - 150, s: 7 + (i * 13 % 20),
    });
    this.update(0.16, new THREE.Vector3(), 0);
  }

  /** time is fraction of a day: 0 sunrise, .25 noon, .5 sunset, .75 midnight. */
  update(time: number, player: THREE.Vector3, elapsed: number) {
    this.timeOfDay = ((time % 1) + 1) % 1;
    const angle = this.timeOfDay * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), Math.sin(angle * .37) * .35).normalize();
    const daylight = clamp(sunDir.y * 2.3 + 0.12, 0, 1);
    const twilight = clamp(1 - Math.abs(sunDir.y) * 5, 0, 1);
    const zenith = new THREE.Color().lerpColors(new THREE.Color('#071329'), new THREE.Color('#4c91d7'), daylight);
    zenith.lerp(new THREE.Color('#76587b'), twilight * .35);
    const horizon = new THREE.Color().lerpColors(new THREE.Color('#17223b'), new THREE.Color('#d8edf3'), daylight);
    horizon.lerp(new THREE.Color('#ef9a67'), twilight * .65);
    (this.uniforms.zenith.value as THREE.Color).copy(zenith);
    (this.uniforms.horizon.value as THREE.Color).copy(horizon);
    (this.uniforms.sunDir.value as THREE.Vector3).copy(sunDir);
    this.uniforms.daylight.value = daylight;
    const sunColor = new THREE.Color().lerpColors(new THREE.Color('#ff814f'), new THREE.Color('#fff3d5'), daytimeFactor(daylight));
    this.sun.color.copy(sunColor);
    this.sun.intensity = .16 + daylight * 2.05;
    this.sun.position.copy(sunDir).multiplyScalar(90).add(new THREE.Vector3(player.x, 0, player.z));
    this.sun.target.position.set(player.x, 0, player.z);
    this.hemi.color.copy(horizon);
    this.hemi.groundColor.set(daylight > .3 ? 0x5a4b35 : 0x141b2a);
    this.hemi.intensity = lerp(.28, 1.05, daylight);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(horizon).lerp(zenith, .16);
      this.scene.fog.density = lerp(.020, .0105, daylight);
    }
    this.dome.position.set(player.x, 0, player.z);
    this.group.position.set(player.x, 0, player.z);
    this.clouds.position.set(0, 0, 0);
    const matrix = new THREE.Matrix4();
    this.cloudData.forEach((cloud, i) => {
      const drift = (cloud.x + elapsed * 0.5 + 150) % 300 - 150;
      matrix.compose(
        new THREE.Vector3(drift, cloud.y, cloud.z),
        new THREE.Quaternion(),
        new THREE.Vector3(cloud.s, 1.5, cloud.s * .58),
      );
      this.clouds.setMatrixAt(i, matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    (this.clouds.material as THREE.MeshLambertMaterial).color.setRGB(lerp(.3, 1, daylight), lerp(.36, 1, daylight), lerp(.52, 1, daylight));
  }

  get isNight() { return this.timeOfDay > .5 || this.timeOfDay < .035; }
  dispose() {
    this.scene.remove(this.group, this.sun, this.sun.target, this.hemi);
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.clouds.geometry.dispose(); (this.clouds.material as THREE.Material).dispose();
  }
}
function daytimeFactor(x: number) { return clamp((x - .2) / .8, 0, 1); }
