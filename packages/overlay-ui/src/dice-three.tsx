'use client';

import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, CanvasTexture, CircleGeometry, DirectionalLight, DoubleSide, Euler, Group,
  LinearFilter, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera,
  PlaneGeometry, Quaternion, Scene, SRGBColorSpace, TorusGeometry, Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DICE_FLOOR_Y, diceThrowMotion, diceThrowPose, roundedDieSupportHeight } from './dice-motion';

const pipLayouts: readonly (readonly [number, number][])[] = [
  [], [[0, 0]], [[-.47, .47], [.47, -.47]],
  [[-.47, .47], [0, 0], [.47, -.47]],
  [[-.47, .47], [.47, .47], [-.47, -.47], [.47, -.47]],
  [[-.47, .47], [.47, .47], [0, 0], [-.47, -.47], [.47, -.47]],
  [[-.47, .48], [.47, .48], [-.47, 0], [.47, 0], [-.47, -.48], [.47, -.48]],
];

const faceRotations: readonly (readonly [number, number])[] = [
  [0, 0], [0, 0], [0, Math.PI / 2], [-Math.PI / 2, 0],
  [Math.PI / 2, 0], [0, -Math.PI / 2], [0, Math.PI],
];

const faceToTop: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [-Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [0, 0, 0],
  [Math.PI, 0, 0], [0, 0, -Math.PI / 2], [Math.PI / 2, 0, 0],
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const DIE_VISUAL_SCALE = 1.2;

export function ThreeDiceCanvas({ dice, rollKey, animate, onReady, onUnavailable }: {
  dice: readonly number[]; rollKey: string; animate: boolean;
  onReady: () => void; onUnavailable: () => void;
}) {
  const diceSignature = dice.join(',');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(onReady);
  const unavailableRef = useRef(onUnavailable);
  readyRef.current = onReady;
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!context) { unavailableRef.current(); return; }

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      unavailableRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new Scene();
    const camera = new OrthographicCamera(-2.9, 2.9, 2.9, -2.9, .1, 100);
    camera.position.set(0, 4.2, 8);
    camera.lookAt(0, .12, 0);
    scene.add(new AmbientLight(0xffffff, 1.4));
    const keyLight = new DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(-2.5, 7, 5);
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0xffd6e6, .7);
    fillLight.position.set(4, 2, -2);
    scene.add(fillLight);

    const tray = canvas.closest('.dice-tray');
    const style = tray ? getComputedStyle(tray) : null;
    const pipColor = style?.getPropertyValue('--dice-pip').trim() || '#74264c';
    const edgeColor = style?.getPropertyValue('--dice-edge').trim() || '#cb779b';
    const bodyMaterial = new MeshPhysicalMaterial({ color: 0xfff7fb, roughness: .32, metalness: 0, clearcoat: .45, clearcoatRoughness: .23 });
    const pipMaterial = new MeshStandardMaterial({ color: pipColor, roughness: .72 });
    const rimMaterial = new MeshStandardMaterial({ color: edgeColor, roughness: .52 });
    const bodyGeometry = new RoundedBoxGeometry(2, 2, 2, 5, .21);
    const pipGeometry = new CircleGeometry(.16, 28);
    const rimGeometry = new TorusGeometry(.168, .026, 6, 28);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(64, 64, 4, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(65, 31, 55, .5)');
      gradient.addColorStop(.55, 'rgba(65, 31, 55, .22)');
      gradient.addColorStop(1, 'rgba(65, 31, 55, 0)');
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = new CanvasTexture(shadowCanvas);
    shadowTexture.minFilter = LinearFilter;
    shadowTexture.magFilter = LinearFilter;
    const shadowGeometry = new PlaneGeometry(3.7, 2.9);
    const shadowMaterials: MeshBasicMaterial[] = [];

    const throws = dice.map((value, index) => {
      const motion = diceThrowMotion(rollKey, index, dice.length);
      const die = new Group();
      die.scale.setScalar(DIE_VISUAL_SCALE);
      const body = new Mesh(bodyGeometry, bodyMaterial);
      die.add(body);
      for (let face = 1; face <= 6; face++) {
        const side = new Group();
        const [x, y] = faceRotations[face];
        side.rotation.set(x, y, 0);
        for (const [pipX, pipY] of pipLayouts[face]) {
          const pip = new Mesh(pipGeometry, pipMaterial);
          pip.position.set(pipX, pipY, 1.011);
          side.add(pip);
          const rim = new Mesh(rimGeometry, rimMaterial);
          rim.position.set(pipX, pipY, 1.016);
          side.add(rim);
        }
        die.add(side);
      }
      scene.add(die);
      const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .65, depthWrite: false, side: DoubleSide });
      shadowMaterials.push(shadowMaterial);
      const shadow = new Mesh(shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = DICE_FLOOR_Y + .003;
      scene.add(shadow);
      const [finalX, finalY, finalZ] = faceToTop[value];
      const faceQuaternion = new Quaternion().setFromEuler(new Euler(finalX, finalY, finalZ));
      const yaw = new Quaternion().setFromEuler(new Euler(0, motion.finalYaw, 0));
      const rollAxis = new Vector3(motion.launchZ, 0, -motion.launchX).normalize();
      return { die, shadow, shadowMaterial, finalQuaternion: yaw.multiply(faceQuaternion), motion, rollAxis, finalPosition: dice.length === 1 ? 0 : index === 0 ? -1.45 : 1.45, depth: (dice.length === 1 ? 0 : index === 0 ? .12 : -.12) + motion.restZ };
    });
    const rollQuaternion = new Quaternion();
    const startedAt = performance.now();
    let settled = !animate;
    let reported = false;

    const draw = (now: number) => {
      let allSettled = true;
      let anyVisible = false;
      for (const { die, shadow, shadowMaterial, finalQuaternion, motion, rollAxis, finalPosition, depth } of throws) {
        const t = animate ? clamp01((now - startedAt - motion.delayMs) / motion.durationMs) : 1;
        if (t < 1) allSettled = false;
        die.visible = t > 0 || !animate;
        anyVisible ||= die.visible;
        const pose = diceThrowPose(motion, t);
        rollQuaternion.setFromAxisAngle(rollAxis, pose.rollRadians);
        die.quaternion.copy(rollQuaternion).multiply(finalQuaternion);
        die.position.set(finalPosition + pose.x, DICE_FLOOR_Y + DIE_VISUAL_SCALE * roundedDieSupportHeight(die.quaternion) + .012 + pose.lift, depth + pose.z);
        shadow.position.set(die.position.x, DICE_FLOOR_Y + .003, die.position.z);
        shadow.scale.setScalar(1 + pose.lift * .35);
        shadowMaterial.opacity = .65 / (1 + pose.lift * 1.2);
        shadow.visible = die.visible;
      }
      renderer.render(scene, camera);
      if (anyVisible && !reported) { reported = true; readyRef.current(); }
      if (allSettled && !settled) { settled = true; renderer.setAnimationLoop(null); }
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.left = -2.9 * aspect;
      camera.right = 2.9 * aspect;
      camera.updateProjectionMatrix();
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); unavailableRef.current(); };
    canvas.addEventListener('webglcontextlost', lost);
    resize();
    if (animate) renderer.setAnimationLoop(draw);

    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      renderer.setAnimationLoop(null);
      bodyGeometry.dispose(); pipGeometry.dispose(); rimGeometry.dispose(); shadowGeometry.dispose(); shadowTexture.dispose();
      bodyMaterial.dispose(); pipMaterial.dispose(); rimMaterial.dispose();
      for (const material of shadowMaterials) material.dispose();
      renderer.dispose();
    };
    // A roll is a new keyed component. Phase changes keep the same WebGL scene alive.
  }, [diceSignature, rollKey]);

  return <canvas ref={canvasRef} className="three-dice-canvas" data-dice-renderer="three" aria-hidden="true" />;
}
