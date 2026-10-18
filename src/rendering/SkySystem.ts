import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/math';

const DAY_TOP = new THREE.Color(0x4c86b8);
const DAY_HORIZON = new THREE.Color(0x9fc1cd);
const NIGHT_TOP = new THREE.Color(0x060d19);
const NIGHT_HORIZON = new THREE.Color(0x17263b);
const DUSK_HORIZON = new THREE.Color(0xe7a06e);
const DAY_SUN = new THREE.Color(0xfff3c4);
const DUSK_SUN = new THREE.Color(0xffb26a);
const MOON_LIGHT = new THREE.Color(0x9db8dd);

export class SkySystem {
  readonly sunLight: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;

  private readonly scene: THREE.Scene;
  private readonly skyRoot = new THREE.Group();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly sunSprite: THREE.Sprite;
  private readonly moonSprite: THREE.Sprite;
  private readonly starField: THREE.Points;
  private readonly starMaterial: THREE.PointsMaterial;
  private readonly sunDirection = new THREE.Vector3();
  private readonly moonDirection = new THREE.Vector3();
  private readonly sunColor = new THREE.Color();
  private readonly topColor = new THREE.Color();
  private readonly horizonColor = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private timeOfDay = 0.31;
  private renderDistance = 4;

  private readonly dayTop = DAY_TOP.clone();
  private readonly dayHorizon = DAY_HORIZON.clone();
  private readonly nightTop = NIGHT_TOP.clone();
  private readonly nightHorizon = NIGHT_HORIZON.clone();
  private readonly duskHorizon = DUSK_HORIZON.clone();
  private readonly daySun = DAY_SUN.clone();
  private readonly duskSun = DUSK_SUN.clone();
  private readonly hemiSkyColor = new THREE.Color(0xe5f4ff);
  private readonly nightHemiColor = new THREE.Color(0x34465f);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.fog = new THREE.Fog(0x9ecbe1, 40, 80);

    this.hemisphere = new THREE.HemisphereLight(0xd8efff, 0x5a4c36, 0.6);
    this.sunLight = new THREE.DirectionalLight(0xfff3cf, 1.4);
    this.sunLight.position.set(40, 80, 30);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(this.hemisphere, this.sunLight, this.ambient);

    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: this.dayTop.clone() },
        uHorizonColor: { value: this.dayHorizon.clone() },
        uSunColor: { value: this.daySun.clone() },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uDayFactor: { value: 1 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDirection;
        uniform float uDayFactor;
        varying vec3 vWorldPosition;

        void main() {
          vec3 direction = normalize(vWorldPosition - cameraPosition);
          float heightMix = smoothstep(-0.08, 0.68, direction.y);
          vec3 color = mix(uHorizonColor, uTopColor, heightMix);
          float sunAmount = max(dot(direction, uSunDirection), 0.0);
          color += uSunColor * pow(sunAmount, 30.0) * (0.25 + uDayFactor * 0.7);
          color += uSunColor * pow(sunAmount, 4.0) * 0.035 * uDayFactor;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const skyGeometry = new THREE.SphereGeometry(420, 32, 20);
    const skyDome = new THREE.Mesh(skyGeometry, this.skyMaterial);
    skyDome.frustumCulled = false;
    skyDome.renderOrder = -100;
    this.skyRoot.add(skyDome);

    this.sunSprite = createCelestialSprite('sun');
    this.moonSprite = createCelestialSprite('moon');
    this.sunSprite.scale.setScalar(54);
    this.moonSprite.scale.setScalar(40);
    this.sunSprite.renderOrder = -90;
    this.moonSprite.renderOrder = -90;
    this.skyRoot.add(this.sunSprite, this.moonSprite);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(720 * 3);
    for (let i = 0; i < 720; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.92 + 0.02;
      const radius = Math.sqrt(1 - y * y);
      starPositions[i * 3] = Math.cos(theta) * radius * 340;
      starPositions[i * 3 + 1] = y * 340;
      starPositions[i * 3 + 2] = Math.sin(theta) * radius * 340;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xf6fbff,
      size: 1.35,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.starField = new THREE.Points(starGeometry, this.starMaterial);
    this.starField.frustumCulled = false;
    this.starField.renderOrder = -95;
    this.skyRoot.add(this.starField);

    scene.add(this.skyRoot);
  }

  get currentTime(): number {
    return this.timeOfDay;
  }

  get sunElevation(): number {
    return this.sunDirection.y;
  }

  setTimeOfDay(time: number): void {
    this.timeOfDay = ((time % 1) + 1) % 1;
  }

  advance(dt: number, dayLengthSeconds: number): void {
    this.timeOfDay = (this.timeOfDay + dt / dayLengthSeconds) % 1;
  }

  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.max(30, distance * 16 * 0.9);
      this.scene.fog.far = Math.max(64, distance * 16 * 1.3);
    }
  }

  update(camera: THREE.Camera): void {
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    this.sunDirection.set(Math.cos(angle), Math.sin(angle), 0.22).normalize();
    this.moonDirection.copy(this.sunDirection).multiplyScalar(-1);

    const sunHeight = this.sunDirection.y;
    const dayFactor = smoothstep(-0.12, 0.22, sunHeight);
    const duskFactor = clamp(1 - Math.abs(sunHeight) * 3.6, 0, 1) * smoothstep(-0.25, 0.03, sunHeight);
    const nightFactor = 1 - smoothstep(-0.26, -0.02, sunHeight);

    this.topColor.copy(this.nightTop).lerp(this.dayTop, dayFactor);
    this.horizonColor.copy(this.nightHorizon).lerp(this.dayHorizon, dayFactor);
    this.horizonColor.lerp(this.duskHorizon, duskFactor * 0.5);
    this.sunColor.copy(this.daySun).lerp(this.duskSun, duskFactor);

    const uniforms = this.skyMaterial.uniforms;
    (uniforms.uTopColor!.value as THREE.Color).copy(this.topColor);
    (uniforms.uHorizonColor!.value as THREE.Color).copy(this.horizonColor);
    (uniforms.uSunColor!.value as THREE.Color).copy(this.sunColor);
    (uniforms.uSunDirection!.value as THREE.Vector3).copy(this.sunDirection);
    uniforms.uDayFactor!.value = dayFactor;

    this.skyRoot.position.copy(camera.position);
    this.sunSprite.position.copy(this.sunDirection).multiplyScalar(360);
    this.moonSprite.position.copy(this.moonDirection).multiplyScalar(350);
    this.starField.rotation.z = this.timeOfDay * Math.PI * 0.25;
    this.starMaterial.opacity = nightFactor * 0.8;
    this.starField.visible = nightFactor > 0.01;
    this.sunSprite.visible = dayFactor > 0.02 || duskFactor > 0.02;
    this.moonSprite.visible = nightFactor > 0.02;
    this.sunSprite.material.opacity = clamp(dayFactor + duskFactor * 0.4, 0, 1);
    this.moonSprite.material.opacity = clamp(nightFactor * 1.15, 0, 1);

    const lightDirection = nightFactor > 0.65 ? this.moonDirection : this.sunDirection;
    this.sunLight.position.copy(lightDirection).multiplyScalar(120);
    this.sunLight.intensity = 0.06 + dayFactor * 1.15 + nightFactor * 0.22;
    this.sunLight.color.copy(nightFactor > 0.65 ? MOON_LIGHT : this.sunColor);
    this.hemisphere.intensity = 0.18 + dayFactor * 0.9 + nightFactor * 0.14;
    this.ambient.intensity = 0.1 + dayFactor * 0.25 + nightFactor * 0.07;
    this.hemisphere.color.copy(this.nightHemiColor).lerp(this.hemiSkyColor, dayFactor * 0.7);

    this.fogColor.copy(this.horizonColor).lerp(this.topColor, 0.3);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near = Math.max(30, this.renderDistance * 16 * 0.9);
      this.scene.fog.far = Math.max(64, this.renderDistance * 16 * 1.3);
    }
    this.scene.background = this.fogColor;
  }

  get isNight(): boolean {
    return this.sunDirection.y < -0.05;
  }

  dispose(): void {
    this.scene.remove(this.skyRoot, this.hemisphere, this.sunLight, this.ambient);
    this.skyRoot.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
    this.skyMaterial.dispose();
    if (this.scene.fog) this.scene.fog = null;
  }
}

function createCelestialSprite(kind: 'sun' | 'moon'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create sky sprite');
  context.clearRect(0, 0, 128, 128);

  if (kind === 'sun') {
    const glow = context.createRadialGradient(64, 64, 8, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255, 251, 221, 1)');
    glow.addColorStop(0.28, 'rgba(255, 236, 164, 0.98)');
    glow.addColorStop(0.45, 'rgba(255, 201, 103, 0.38)');
    glow.addColorStop(1, 'rgba(255, 170, 70, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = 'rgba(255,255,236,0.94)';
    context.beginPath();
    context.arc(64, 64, 25, 0, Math.PI * 2);
    context.fill();
  } else {
    const glow = context.createRadialGradient(64, 64, 7, 64, 64, 60);
    glow.addColorStop(0, 'rgba(224, 239, 255, 0.7)');
    glow.addColorStop(0.4, 'rgba(157, 190, 231, 0.2)');
    glow.addColorStop(1, 'rgba(90, 125, 170, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = 'rgba(226, 237, 250, 0.96)';
    context.beginPath();
    context.arc(64, 64, 25, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(159, 180, 207, 0.5)';
    const craters = [
      [56, 55, 6],
      [72, 68, 4],
      [63, 77, 3],
      [73, 51, 3],
    ];
    for (const [x, y, radius] of craters) {
      context.beginPath();
      context.arc(x!, y!, radius!, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    blending: kind === 'sun' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.frustumCulled = false;
  return sprite;
}
