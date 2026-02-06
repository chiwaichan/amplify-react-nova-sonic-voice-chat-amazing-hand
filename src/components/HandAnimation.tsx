import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HandPose } from '../data/aslSigns';
import './HandAnimation.css';

interface HandAnimationProps {
  currentPose?: HandPose;
}

function createHand(side: 'right' | 'left'): {
  handGroup: THREE.Group;
  fingerGroups: THREE.Group[];
} {
  const handGroup = new THREE.Group();
  const fingerGroups: THREE.Group[] = [];

  const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xf0c8a0 });
  const jointMaterial = new THREE.MeshLambertMaterial({ color: 0xe0b890 });

  // Palm
  const palmGeometry = new THREE.BoxGeometry(1.2, 0.3, 1.4);
  const palm = new THREE.Mesh(palmGeometry, skinMaterial);
  palm.castShadow = true;
  handGroup.add(palm);

  // Finger configs: [name, xOffset, zOffset, length, thickness, isThumb]
  const fingerConfigs: [string, number, number, number, number, boolean][] = [
    ['thumb', 0.55, 0.5, 0.7, 0.22, true],
    ['index', 0, -0.4, 0.9, 0.18, false],
    ['middle', 0, -0.1, 0.95, 0.18, false],
    ['ringPinky', 0, 0.25, 0.85, 0.22, false],
  ];

  const mirror = side === 'left' ? -1 : 1;

  for (const [, xOffset, zOffset, length, thickness, isThumb] of fingerConfigs) {
    const pivot = new THREE.Group();

    if (isThumb) {
      // Thumb attaches to the side of the palm
      pivot.position.set(xOffset * mirror, 0, zOffset);
      pivot.rotation.z = (mirror * -Math.PI) / 6; // angle outward
    } else {
      // Fingers attach to the top edge of the palm
      pivot.position.set(xOffset * mirror, 0.15, zOffset);
    }

    // Finger segment inside the pivot, extending upward from pivot point
    const segGeometry = new THREE.BoxGeometry(thickness, length, thickness);
    const segment = new THREE.Mesh(segGeometry, skinMaterial);
    segment.position.y = length / 2;
    segment.castShadow = true;
    pivot.add(segment);

    // Small joint sphere at the tip
    const jointGeometry = new THREE.SphereGeometry(thickness * 0.55, 8, 8);
    const joint = new THREE.Mesh(jointGeometry, jointMaterial);
    joint.position.y = length;
    pivot.add(joint);

    handGroup.add(pivot);
    fingerGroups.push(pivot);
  }

  // Mirror the left hand
  if (side === 'left') {
    handGroup.scale.x = -1;
  }

  return { handGroup, fingerGroups };
}

export function HandAnimation({ currentPose }: HandAnimationProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const fingerGroupsRef = useRef<{ right: THREE.Group[]; left: THREE.Group[] }>({
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

    // Lighting
    const ambient = new THREE.AmbientLight(0x606070, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(5, 8, 5);
    directional.castShadow = true;
    scene.add(directional);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);

    // Build hands
    const { handGroup: rightHand, fingerGroups: rightFingers } = createHand('right');
    rightHand.position.set(0, 0, 0);
    scene.add(rightHand);
    rightHandRef.current = rightHand;
    fingerGroupsRef.current.right = rightFingers;

    const { handGroup: leftHand, fingerGroups: leftFingers } = createHand('left');
    leftHand.position.set(-1.8, 0, 0);
    leftHand.visible = false;
    scene.add(leftHand);
    leftHandRef.current = leftHand;
    fingerGroupsRef.current.left = leftFingers;

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
      fingerGroupsRef.current.right.forEach((group, i) => {
        if (i === 0) {
          group.rotation.z = -Math.PI / 6; // thumb resting angle
        } else {
          group.rotation.x = 0;
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

    const applyServos = (servos: readonly [number, number, number, number], groups: THREE.Group[]) => {
      servos.forEach((val, i) => {
        const angle = -(val / 180) * (Math.PI / 2);
        if (i === 0) {
          // Thumb curls on z-axis
          groups[i].rotation.z = -Math.PI / 6 + angle;
        } else {
          groups[i].rotation.x = angle;
        }
      });
    };

    if ((hand === 'right' || hand === 'both') && currentPose.right) {
      applyServos(currentPose.right, fingerGroupsRef.current.right);
    }
    if ((hand === 'left' || hand === 'both') && currentPose.left) {
      applyServos(currentPose.left, fingerGroupsRef.current.left);
    }
  }, [currentPose]);

  return <div ref={mountRef} className="hand-animation-container" />;
}
