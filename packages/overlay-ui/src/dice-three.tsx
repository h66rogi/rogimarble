'use client';

import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, CircleGeometry, DirectionalLight, Euler, Group,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PCFShadowMap,
  PlaneGeometry, Quaternion, Scene, ShadowMaterial, SRGBColorSpace, TorusGeometry,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { diceThrowMotion } from './dice-motion';

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

const faceToFront: readonly (readonly [number, number])[] = [
  [0, 0], [0, 0], [0, -Math.PI / 2], [Math.PI / 2, 0],
  [-Math.PI / 2, 0], [0, Math.PI / 2], [0, Math.PI],
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function ThreeDieCanvas({ value, index, rollKey, animate, onReady, onUnavailable }: {
  value: number; index: number; rollKey: string; animate: boolean;
  onReady: () => void; onUnavailable: () => void;
}) {
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
    const camera = new OrthographicCamera(-3.45, 3.45, 3.45, -3.45, .1, 100);
    camera.position.set(0, 2.6, 8);
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
    const groundMaterial = new ShadowMaterial({ color: 0x45243a, opacity: .23 });
    const bodyGeometry = new RoundedBoxGeometry(2, 2, 2, 5, .21);
    const pipGeometry = new CircleGeometry(.16, 28);
    const rimGeometry = new TorusGeometry(.168, .026, 6, 28);
    const floorGeometry = new PlaneGeometry(11, 11);
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
    const floor = new Mesh(floorGeometry, groundMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.1;
    floor.receiveShadow = true;
    scene.add(floor);

    const [finalX, finalY] = faceToFront[value];
    const faceQuaternion = new Quaternion().setFromEuler(new Euler(finalX, finalY, 0));
    const cameraTilt = new Quaternion().setFromEuler(new Euler(.12, -.14, .04));
    const finalQuaternion = cameraTilt.multiply(faceQuaternion);
    const spinQuaternion = new Quaternion();
    const motion = diceThrowMotion(rollKey, index);
    const startedAt = performance.now();
    let settled = !animate;
    let reported = false;

    const draw = (now: number) => {
      const t = animate ? clamp01((now - startedAt - motion.delayMs) / motion.durationMs) : 1;
      die.visible = t > 0 || !animate;
      if (t < .58) {
        const u = t / .58;
        die.position.x = motion.launchX * (1 - u) ** 1.4 + motion.driftX * Math.sin(Math.PI * u);
        die.position.y = motion.launchY * (1 - u) ** 2 + motion.arcHeight * Math.sin(Math.PI * u);
      } else if (t < .82) {
        const u = (t - .58) / .24;
        die.position.x = motion.driftX * (1 - u);
        die.position.y = motion.bounceHeight * Math.sin(Math.PI * u);
      } else {
        const u = (t - .82) / .18;
        die.position.x = 0;
        die.position.y = .15 * Math.sin(Math.PI * u);
      }
      const remaining = (1 - t) ** 2;
      spinQuaternion.setFromEuler(new Euler(motion.spinX * remaining, motion.spinY * remaining, motion.spinZ * remaining));
      die.quaternion.copy(finalQuaternion).multiply(spinQuaternion);
      renderer.render(scene, camera);
      if (die.visible && !reported) { reported = true; readyRef.current(); }
      if (t >= 1 && !settled) { settled = true; renderer.setAnimationLoop(null); }
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.left = -3.45 * aspect;
      camera.right = 3.45 * aspect;
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
      bodyGeometry.dispose(); pipGeometry.dispose(); rimGeometry.dispose(); floorGeometry.dispose();
      bodyMaterial.dispose(); pipMaterial.dispose(); rimMaterial.dispose(); groundMaterial.dispose();
      renderer.dispose();
    };
    // A roll is a new keyed component. Phase changes keep the same WebGL scene alive.
  }, [value, index, rollKey]);

  return <canvas ref={canvasRef} className="three-die-canvas" data-dice-renderer="three" aria-hidden="true" />;
}
