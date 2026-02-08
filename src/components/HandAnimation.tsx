import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HandPose } from '../data/aslSigns';
import './HandAnimation.css';

export interface FingerAngles {
  index: { angle_1: number; angle_2: number };
  middle: { angle_1: number; angle_2: number };
  ring: { angle_1: number; angle_2: number };
  thumb: { angle_1: number; angle_2: number };
}

interface HandAnimationProps {
  currentPose?: HandPose;
  fingerAngles?: FingerAngles;
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
  const _servoMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a6dd4,
    metalness: 0.2,
    roughness: 0.5,
  });
  void _servoMaterial; // reserved for servo detail accents
  const shellMaterial = new THREE.MeshStandardMaterial({ // used by wrist cap below
    color: 0x3a3a3a,
    metalness: 0.1,
    roughness: 0.7,
  });
  void shellMaterial;
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    metalness: 0.1,
    roughness: 0.8,
  });

  const mirror = side === 'left' ? -1 : 1;

  // --- Palm (curved cup/bowl shell like the Amazing Hand) ---
  // LatheGeometry profile: radius vs height, revolved around Y axis
  // Wider at top (knuckles), tapers to narrow wrist at bottom
  const cupProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const y = -0.5 + t * 0.65; // from -0.5 (wrist) to 0.15 (knuckle rim)
    // Smooth curve: narrow at bottom, widens toward top
    const radius = 0.18 + 0.38 * Math.pow(t, 0.6);
    cupProfile.push(new THREE.Vector2(radius, y));
  }

  // Close the profile to make a solid shape: add points going back down at radius 0
  const solidProfile = [
    new THREE.Vector2(0, cupProfile[cupProfile.length - 1].y), // top center
    ...cupProfile.slice().reverse(),                            // outer edge top→bottom
    new THREE.Vector2(0, cupProfile[0].y),                      // bottom center
  ];

  // Full 360-degree revolution → solid cup shape
  const cupGeo = new THREE.LatheGeometry(solidProfile, 32);
  const cupSolid = new THREE.Mesh(cupGeo, frameMaterial);
  cupSolid.castShadow = true;
  cupSolid.receiveShadow = true;
  handGroup.add(cupSolid);

  // --- Finger configs (scaled to palm) ---
  // [xOffset, zOffset, proximalLength, distalLength, radius, isThumb]
  // Fingers placed around the bowl rim (y=0.15, rim radius ~0.5)
  // [xOffset, zOffset, proximalLength, distalLength, radius, isThumb]
  const fingerConfigs: [number, number, number, number, number, boolean][] = [
    [0.45, 0.28, 0.55, 0.4, 0.08, true],      // thumb — side of bowl
    [0.3, -0.38, 0.65, 0.45, 0.065, false],    // index — front-left of rim
    [0.0, -0.5, 0.7, 0.48, 0.065, false],      // middle — front center of rim
    [-0.3, -0.38, 0.6, 0.42, 0.08, false],     // ringPinky — front-right of rim
  ];

  for (const [xOffset, zOffset, proxLen, distLen, radius, isThumb] of fingerConfigs) {
    // Root pivot group (proximal)
    const fingerRoot = new THREE.Group();

    if (isThumb) {
      fingerRoot.position.set(xOffset * mirror, 0, zOffset);
      fingerRoot.rotation.z = (mirror * -Math.PI) / 6;
    } else {
      fingerRoot.position.set(xOffset * mirror, 0.15, zOffset);
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

export function HandAnimation({ currentPose, fingerAngles }: HandAnimationProps) {
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
    scene.background = new THREE.Color(0xffffff);
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

  // Update finger positions when pose or fingerAngles changes
  useEffect(() => {
    const rightHand = rightHandRef.current;
    const leftHand = leftHandRef.current;
    if (!rightHand || !leftHand) return;

    // Convert angle from -90..90 range to radians
    // -90 = fully extended, 90 = fully curled
    const angleToRad = (angle: number): number => {
      return (angle / 90) * (Math.PI / 2);
    };

    // Apply fingerAngles (8-servo model) if provided
    const applyFingerAngles = (angles: FingerAngles, rigs: FingerRig[]) => {
      // Order: thumb, index, middle, ring (matching fingerConfigs)
      const fingerData = [
        angles.thumb,
        angles.index,
        angles.middle,
        angles.ring,
      ];

      fingerData.forEach((finger, i) => {
        const proxAngle = angleToRad(finger.angle_1);
        const distalAngle = angleToRad(finger.angle_2);

        if (i === 0) {
          // Thumb curls on z-axis (inward toward palm)
          rigs[i].root.rotation.z = -Math.PI / 6 - proxAngle;
          rigs[i].distal.rotation.z = -distalAngle;
        } else {
          rigs[i].root.rotation.x = -proxAngle;
          rigs[i].distal.rotation.x = -distalAngle;
        }
      });
    };

    // If fingerAngles provided, use that for right hand
    if (fingerAngles) {
      rightHand.visible = true;
      rightHand.position.set(0, 0, 0);
      leftHand.visible = false;
      applyFingerAngles(fingerAngles, fingerRigsRef.current.right);
      return;
    }

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
          // Thumb curls on z-axis (inward toward palm)
          rigs[i].root.rotation.z = -Math.PI / 6 - proxAngle;
          rigs[i].distal.rotation.z = -distalAngle;
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
  }, [currentPose, fingerAngles]);

  return <div ref={mountRef} className="hand-animation-container" />;
}
