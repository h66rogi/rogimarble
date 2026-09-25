'use client';

import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, CircleGeometry, DirectionalLight, Euler, Group,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PCFShadowMap,
  Quaternion, Scene, SRGBColorSpace, TorusGeometry,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DICE_FLOOR_Y, diceThrowMotion, roundedDieSupportHeight } from './dice-motion';

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
    renderer.toneMappingExposure = 1.55;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;

    const scene = new Scene();
    const camera = new OrthographicCamera(-2.9, 2.9, 2.9, -2.9, .1, 100);
    camera.position.set(0, 4.2, 8);
    camera.lookAt(0, .12, 0);
    scene.add(new AmbientLight(0xffffff, 2.1));
    const keyLight = new DirectionalLight(0xffffff, 3.3);
    keyLight.position.set(-2.5, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(256, 256);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -.0002;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0xffd6e6, 1.15);
    fillLight.position.set(4, 2, -2);
    scene.add(fillLight);

    const tray = canvas.closest('.dice-tray');
    const style = tray ? getComputedStyle(tray) : null;
    const pipColor = style?.getPropertyValue('--dice-pip').trim() || '#74264c';
    const edgeColor = style?.getPropertyValue('--dice-edge').trim() || '#cb779b';
    const bodyMaterial = new MeshPhysicalMaterial({ color: 0xfff9fc, roughness: .26, metalness: 0, clearcoat: .55, clearcoatRoughness: .2 });
    const pipMaterial = new MeshStandardMaterial({ color: pipColor, roughness: .72 });
    const rimMaterial = new MeshStandardMaterial({ color: edgeColor, roughness: .52 });
    const floorBaseMaterial = new MeshStandardMaterial({ color: edgeColor, roughness: .8, transparent: true, opacity: .78 });
    const floorTopMaterial = new MeshStandardMaterial({ color: 0xfffafc, roughness: .82 });
    const bodyGeometry = new RoundedBoxGeometry(2, 2, 2, 5, .21);
    const pipGeometry = new CircleGeometry(.16, 28);
    const rimGeometry = new TorusGeometry(.168, .026, 6, 28);
    const floorBaseGeometry = new RoundedBoxGeometry(7.7, .16, 3.35, 4, .075);
    const floorTopGeometry = new RoundedBoxGeometry(7.55, .06, 3.2, 4, .045);
    const floorBase = new Mesh(floorBaseGeometry, floorBaseMaterial);
    floorBase.position.y = DICE_FLOOR_Y - .11;
    scene.add(floorBase);
    const floorTop = new Mesh(floorTopGeometry, floorTopMaterial);
    floorTop.position.y = DICE_FLOOR_Y - .03;
    floorTop.receiveShadow = true;
    scene.add(floorTop);

    const throws = dice.map((value, index) => {
      const die = new Group();
      const body = new Mesh(bodyGeometry, bodyMaterial);
      body.castShadow = true;
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
      const [finalX, finalY, finalZ] = faceToTop[value];
      const faceQuaternion = new Quaternion().setFromEuler(new Euler(finalX, finalY, finalZ));
      const yaw = new Quaternion().setFromEuler(new Euler(0, index === 0 ? .16 : -.16, 0));
      return { die, finalQuaternion: yaw.multiply(faceQuaternion), motion: diceThrowMotion(rollKey, index), finalPosition: dice.length === 1 ? 0 : index === 0 ? -1.2 : 1.2, depth: index === 0 ? .12 : -.12 };
    });
    const spinQuaternion = new Quaternion();
    const startedAt = performance.now();
    let settled = !animate;
    let reported = false;

    const draw = (now: number) => {
      let allSettled = true;
      let anyVisible = false;
      for (const { die, finalQuaternion, motion, finalPosition, depth } of throws) {
        const t = animate ? clamp01((now - startedAt - motion.delayMs) / motion.durationMs) : 1;
        if (t < 1) allSettled = false;
        die.visible = t > 0 || !animate;
        anyVisible ||= die.visible;
        const remaining = (1 - t) ** 2;
        spinQuaternion.setFromEuler(new Euler(motion.spinX * remaining, motion.spinY * remaining, motion.spinZ * remaining));
        die.quaternion.copy(finalQuaternion).multiply(spinQuaternion);
        let x: number;
        let lift: number;
        if (t < .24) {
          const u = t / .24;
          x = finalPosition + motion.launchX * (1 - .34 * u);
          lift = motion.launchY * (1 - u) ** 2 + motion.arcHeight * Math.sin(Math.PI * u);
        } else if (t < .42) {
          const u = (t - .24) / .18;
          x = finalPosition + motion.launchX * (.66 - .3 * u);
          lift = motion.bounceHeight * Math.sin(Math.PI * u);
        } else if (t < .9) {
          const u = (t - .42) / .48;
          x = finalPosition + motion.launchX * .36 * (1 - u) ** 2 + motion.driftX * Math.sin(Math.PI * u) * (1 - u);
          lift = .075 * Math.abs(Math.sin(4 * Math.PI * u)) * (1 - u);
        } else {
          x = finalPosition;
          lift = 0;
        }
        die.position.set(x, DICE_FLOOR_Y + roundedDieSupportHeight(die.quaternion) + .035 + lift, depth);
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
      bodyGeometry.dispose(); pipGeometry.dispose(); rimGeometry.dispose(); floorBaseGeometry.dispose(); floorTopGeometry.dispose();
      bodyMaterial.dispose(); pipMaterial.dispose(); rimMaterial.dispose(); floorBaseMaterial.dispose(); floorTopMaterial.dispose();
      renderer.dispose();
    };
    // A roll is a new keyed component. Phase changes keep the same WebGL scene alive.
  }, [diceSignature, rollKey]);

  return <canvas ref={canvasRef} className="three-dice-canvas" data-dice-renderer="three" aria-hidden="true" />;
}
