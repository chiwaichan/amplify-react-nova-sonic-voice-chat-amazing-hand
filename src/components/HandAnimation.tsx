import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HandPose } from '../data/aslSigns';
import './HandAnimation.css';

interface HandAnimationProps {
  currentPose?: HandPose;
}

interface FingerRig {
  root: THREE.Group;   // proximal pivot
  distal: THREE.Group; // distal pivot
}

function createHand(side: 'right' | 'left'): {
  handGroup: THREE.Group;
  fingerRigs: FingerRig[];
} {
  const handGroup = new THREE.Group();
  const fingerRigs: FingerRig[] = [];

  // --- Materials (industrial robotic look) ---
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    metalness: 0.3,
    roughness: 0.6,
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.3,
  });
  const servoMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a6dd4,
    metalness: 0.2,
    roughness: 0.5,
  });
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    metalness: 0.1,
    roughness: 0.7,
  });
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    metalness: 0.1,
    roughness: 0.8,
  });

  const mirror = side === 'left' ? -1 : 1;

  // --- Palm (compact, hand-shaped) ---
  // Main palm body — narrower and shorter
  const palmGeometry = new THREE.BoxGeometry(0.85, 0.25, 0.9);
  const palm = new THREE.Mesh(palmGeometry, frameMaterial);
  palm.castShadow = true;
  handGroup.add(palm);

  // Thin top plate (shell cover on palm front)
  const topPlateGeo = new THREE.BoxGeometry(0.8, 0.04, 0.85);
  const topPlate = new THREE.Mesh(topPlateGeo, shellMaterial);
  topPlate.position.set(0, 0.14, -0.02);
  handGroup.add(topPlate);

  // Servo housings recessed into palm back (2 small boxes, subtle)
  const servoGeo = new THREE.BoxGeometry(0.15, 0.08, 0.22);
  const servo1 = new THREE.Mesh(servoGeo, servoMaterial);
  servo1.position.set(-0.18, -0.16, -0.12);
  servo1.castShadow = true;
  handGroup.add(servo1);
  const servo2 = new THREE.Mesh(servoGeo, servoMaterial);
  servo2.position.set(0.18, -0.16, -0.12);
  servo2.castShadow = true;
  handGroup.add(servo2);

  // Wrist mount cylinder at palm base
  const wristGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.2, 16);
  const wrist = new THREE.Mesh(wristGeo, frameMaterial);
  wrist.position.set(0, -0.05, 0.55);
  wrist.castShadow = true;
  handGroup.add(wrist);

  // Wrist accent ring
  const wristRingGeo = new THREE.TorusGeometry(0.22, 0.025, 8, 16);
  const wristRing = new THREE.Mesh(wristRingGeo, jointMaterial);
  wristRing.position.set(0, -0.05, 0.45);
  wristRing.rotation.x = Math.PI / 2;
  handGroup.add(wristRing);

  // --- Finger configs (scaled to palm) ---
  // [xOffset, zOffset, proximalLength, distalLength, radius, isThumb]
  const fingerConfigs: [number, number, number, number, number, boolean][] = [
    [0.42, 0.25, 0.55, 0.4, 0.08, true],     // thumb — side of palm
    [0.0, -0.35, 0.65, 0.45, 0.065, false],   // index
    [0.0, -0.12, 0.7, 0.48, 0.065, false],    // middle
    [0.0, 0.12, 0.6, 0.42, 0.08, false],      // ringPinky (wider, combined)
  ];

  for (const [xOffset, zOffset, proxLen, distLen, radius, isThumb] of fingerConfigs) {
    // Root pivot group (proximal)
    const fingerRoot = new THREE.Group();

    if (isThumb) {
      fingerRoot.position.set(xOffset * mirror, 0, zOffset);
      fingerRoot.rotation.z = (mirror * -Math.PI) / 6;
    } else {
      fingerRoot.position.set(xOffset * mirror, 0.125, zOffset);
    }

    // Knuckle ball joint
    const knuckleGeo = new THREE.SphereGeometry(radius * 1.4, 12, 12);
    const knuckle = new THREE.Mesh(knuckleGeo, jointMaterial);
    knuckle.castShadow = true;
    fingerRoot.add(knuckle);

    // Proximal bone (cylinder segment)
    const proxGeo = new THREE.CylinderGeometry(radius, radius * 0.9, proxLen, 10);
    const proxBone = new THREE.Mesh(proxGeo, frameMaterial);
    proxBone.position.y = proxLen / 2;
    proxBone.castShadow = true;
    fingerRoot.add(proxBone);

    // Linkage bar alongside proximal bone (thin rod - mechanical visual)
    const linkageGeo = new THREE.CylinderGeometry(0.015, 0.015, proxLen * 0.85, 4);
    const linkage = new THREE.Mesh(linkageGeo, jointMaterial);
    linkage.position.set(radius * 1.3, proxLen * 0.45, 0);
    fingerRoot.add(linkage);

    // Small linkage connector spheres at top and bottom of linkage
    const linkConnGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const linkConn1 = new THREE.Mesh(linkConnGeo, jointMaterial);
    linkConn1.position.set(radius * 1.3, proxLen * 0.05, 0);
    fingerRoot.add(linkConn1);
    const linkConn2 = new THREE.Mesh(linkConnGeo, jointMaterial);
    linkConn2.position.set(radius * 1.3, proxLen * 0.85, 0);
    fingerRoot.add(linkConn2);

    // Mid-finger ball joint
    const midJointGeo = new THREE.SphereGeometry(radius * 1.2, 12, 12);
    const midJoint = new THREE.Mesh(midJointGeo, jointMaterial);
    midJoint.position.y = proxLen;
    fingerRoot.add(midJoint);

    // Distal group (pivots at mid-finger joint)
    const distalGroup = new THREE.Group();
    distalGroup.position.y = proxLen;

    // Distal bone (cylinder segment)
    const distGeo = new THREE.CylinderGeometry(radius * 0.85, radius * 0.75, distLen, 10);
    const distBone = new THREE.Mesh(distGeo, frameMaterial);
    distBone.position.y = distLen / 2;
    distBone.castShadow = true;
    distalGroup.add(distBone);

    // Fingertip (rounded sphere)
    const tipGeo = new THREE.SphereGeometry(radius * 0.9, 10, 10);
    const tip = new THREE.Mesh(tipGeo, tipMaterial);
    tip.position.y = distLen;
    tip.castShadow = true;
    distalGroup.add(tip);

    fingerRoot.add(distalGroup);
    handGroup.add(fingerRoot);

    fingerRigs.push({ root: fingerRoot, distal: distalGroup });
  }

  // Mirror the left hand
  if (side === 'left') {
    handGroup.scale.x = -1;
  }

  return { handGroup, fingerRigs };
}

export function HandAnimation({ currentPose }: HandAnimationProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const fingerRigsRef = useRef<{ right: FingerRig[]; left: FingerRig[] }>({
    right: [],
    left: [],
  });
  const animationRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rightHandRef = useRef<THREE.Group | null>(null);
  const leftHandRef = useRef<THREE.Group | null>(null);

  // Scene setup
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2.5, 4);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.5, 0);
    controls.minDistance = 2;
    controls.maxDistance = 15;
    controls.enableZoom = true;
    controlsRef.current = controls;

    const handleResize = () => {
      if (mountRef.current) {
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // Lighting — enhanced for metallic materials
    const ambient = new THREE.AmbientLight(0x606070, 0.8);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(5, 8, 5);
    directional.castShadow = true;
    scene.add(directional);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);

    // Build hands
    const { handGroup: rightHand, fingerRigs: rightRigs } = createHand('right');
    rightHand.position.set(0, 0, 0);
    scene.add(rightHand);
    rightHandRef.current = rightHand;
    fingerRigsRef.current.right = rightRigs;

    const { handGroup: leftHand, fingerRigs: leftRigs } = createHand('left');
    leftHand.position.set(-1.8, 0, 0);
    leftHand.visible = false;
    scene.add(leftHand);
    leftHandRef.current = leftHand;
    fingerRigsRef.current.left = leftRigs;

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update finger positions when pose changes
  useEffect(() => {
    const rightHand = rightHandRef.current;
    const leftHand = leftHandRef.current;
    if (!rightHand || !leftHand) return;

    if (!currentPose) {
      // Default: show right hand, all fingers open
      rightHand.visible = true;
      rightHand.position.set(0, 0, 0);
      leftHand.visible = false;
      fingerRigsRef.current.right.forEach((rig, i) => {
        if (i === 0) {
          rig.root.rotation.z = -Math.PI / 6; // thumb resting angle
          rig.distal.rotation.x = 0;
        } else {
          rig.root.rotation.x = 0;
          rig.distal.rotation.x = 0;
        }
      });
      return;
    }

    const { hand } = currentPose;

    if (hand === 'right') {
      rightHand.visible = true;
      rightHand.position.set(0, 0, 0);
      leftHand.visible = false;
    } else if (hand === 'left') {
      rightHand.visible = false;
      leftHand.visible = true;
      leftHand.position.set(0, 0, 0);
    } else {
      // both
      rightHand.visible = true;
      rightHand.position.set(0.9, 0, 0);
      leftHand.visible = true;
      leftHand.position.set(-0.9, 0, 0);
    }

    const applyServos = (servos: readonly [number, number, number, number], rigs: FingerRig[]) => {
      servos.forEach((val, i) => {
        const proxAngle = -(val / 180) * (Math.PI / 2);
        const distalAngle = proxAngle * 0.5; // synchronized linkage: distal follows at 50%

        if (i === 0) {
          // Thumb curls on z-axis
          rigs[i].root.rotation.z = -Math.PI / 6 + proxAngle;
          rigs[i].distal.rotation.z = distalAngle;
        } else {
          rigs[i].root.rotation.x = proxAngle;
          rigs[i].distal.rotation.x = distalAngle;
        }
      });
    };

    if ((hand === 'right' || hand === 'both') && currentPose.right) {
      applyServos(currentPose.right, fingerRigsRef.current.right);
    }
    if ((hand === 'left' || hand === 'both') && currentPose.left) {
      applyServos(currentPose.left, fingerRigsRef.current.left);
    }
  }, [currentPose]);

  return <div ref={mountRef} className="hand-animation-container" />;
}
