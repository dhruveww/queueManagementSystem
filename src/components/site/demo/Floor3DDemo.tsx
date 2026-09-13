"use client";

import { Grid, Html, OrbitControls, ContactShadows } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TABLE_STATUS_COLOR, type TableStatus } from "@/lib/types";
import {
  SEAT_HEIGHT,
  TABLE_HEIGHT,
  centroid,
  convexHull,
  expandHull,
  seatTransformsFor,
  tableCorners,
} from "@/components/floor3d/geometry";

/**
 * A scripted miniature of the real Pro floor view, for the marketing demo.
 *
 * It deliberately imports the product's own geometry helpers and status
 * colours rather than re-drawing something that merely looks similar — the
 * hull a visitor watches sweep around T4 and T5 is computed by exactly the
 * function that draws it on a live floor. Only the data is canned.
 */

type Shape = "round" | "square" | "rect";

interface DemoTable {
  id: string;
  label: string;
  shape: Shape;
  capacity: number;
  pos_x: number;
  pos_z: number;
  rot_y: number;
  width: number;
  depth: number;
  status: TableStatus;
}

/** A believable dinner-service floor: mostly full, two free twos in the corner. */
const TABLES: DemoTable[] = [
  { id: "t1", label: "T1", shape: "round",  capacity: 2, pos_x: -2.8, pos_z: -3.1, rot_y: 0, width: 1.0, depth: 1.0, status: "occupied" },
  { id: "t2", label: "T2", shape: "square", capacity: 4, pos_x:  0.0, pos_z: -3.1, rot_y: 0, width: 1.1, depth: 1.1, status: "occupied" },
  { id: "t3", label: "T3", shape: "square", capacity: 4, pos_x:  2.8, pos_z: -3.1, rot_y: 0, width: 1.1, depth: 1.1, status: "clearing" },
  { id: "t4", label: "T4", shape: "rect",   capacity: 4, pos_x: -2.6, pos_z:  0.0, rot_y: 0, width: 1.7, depth: 1.0, status: "free" },
  { id: "t5", label: "T5", shape: "rect",   capacity: 4, pos_x: -0.6, pos_z:  0.0, rot_y: 0, width: 1.7, depth: 1.0, status: "free" },
  { id: "t6", label: "T6", shape: "square", capacity: 4, pos_x:  2.8, pos_z:  0.0, rot_y: 0, width: 1.1, depth: 1.1, status: "occupied" },
  { id: "t7", label: "T7", shape: "round",  capacity: 2, pos_x: -2.8, pos_z:  3.0, rot_y: 0, width: 1.0, depth: 1.0, status: "reserved" },
  { id: "t8", label: "T8", shape: "square", capacity: 4, pos_x:  0.0, pos_z:  3.0, rot_y: 0, width: 1.1, depth: 1.1, status: "occupied" },
  { id: "t9", label: "T9", shape: "round",  capacity: 2, pos_x:  2.8, pos_z:  3.0, rot_y: 0, width: 1.0, depth: 1.0, status: "free" },
];

const MERGE_IDS = ["t4", "t5"];
const PARTY = 8;

export type Phase = "live" | "arm" | "select" | "merged" | "seated";

/** The loop the visitor watches, with how long each beat holds. */
const SCRIPT: { phase: Phase; ms: number }[] = [
  { phase: "live", ms: 3600 },
  { phase: "arm", ms: 3400 },
  { phase: "select", ms: 3200 },
  { phase: "merged", ms: 4200 },
  { phase: "seated", ms: 3600 },
];

export const PHASE_COPY: Record<Phase, { step: string; title: string; body: string }> = {
  live: {
    step: "01",
    title: "The room, live",
    body: "Every table colours itself from the database. Nobody updates a whiteboard.",
  },
  arm: {
    step: "02",
    title: "Party of 8 walks in",
    body: "Tap the guest and the floor answers: green fits, dim doesn't. Your biggest table seats 4.",
  },
  select: {
    step: "03",
    title: "Pick two free tables",
    body: "T4 and T5 are free and adjacent. Two taps, no paperwork.",
  },
  merged: {
    step: "04",
    title: "Merged into one",
    body: "A single footprint with a real capacity of 8 — held in one transaction, so two hosts can't double-book it.",
  },
  seated: {
    step: "05",
    title: "Seated · WhatsApp sent",
    body: "The group goes occupied, the queue moves up, and the guest's phone buzzes.",
  },
};

function statusFor(t: DemoTable, phase: Phase): TableStatus {
  if (MERGE_IDS.includes(t.id) && phase === "seated") return "occupied";
  return t.status;
}

/** Which tables are dimmed because they cannot hold the armed party. */
function isUnfit(t: DemoTable, phase: Phase) {
  // Once the host starts picking, the two candidates are the subject of the
  // shot — they stay lit even though neither seats 8 on its own.
  if (phase === "select") return !MERGE_IDS.includes(t.id);
  if (phase !== "arm") return false;
  return !(t.status === "free" && t.capacity >= PARTY);
}

function Table({
  table,
  phase,
  hovered,
  onHover,
}: {
  table: DemoTable;
  phase: Phase;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const merging = MERGE_IDS.includes(table.id);
  const selected = merging && (phase === "select" || phase === "merged" || phase === "seated");
  const inGroup = merging && (phase === "merged" || phase === "seated");
  const unfit = isUnfit(table, phase);
  const status = statusFor(table, phase);

  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const geometry = useMemo(() => {
    if (table.shape === "round") {
      return new THREE.CylinderGeometry(table.width / 2, table.width / 2, TABLE_HEIGHT, 28);
    }
    return new THREE.BoxGeometry(table.width, TABLE_HEIGHT, table.depth);
  }, [table.shape, table.width, table.depth]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Merged members nudge toward each other, the way hosts actually push two
  // tables together before they call it one.
  const targetX = inGroup ? table.pos_x + (table.id === "t4" ? 0.14 : -0.14) : table.pos_x;

  useFrame((_, dt) => {
    const mesh = ref.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const k = 1 - Math.pow(0.001, dt);

    mesh.position.x += (targetX - mesh.position.x) * k;
    const lift = selected && phase === "select" ? 0.1 : 0;
    mesh.position.y += (TABLE_HEIGHT / 2 + lift - mesh.position.y) * k;

    const target = new THREE.Color(TABLE_STATUS_COLOR[status]);
    mat.color.lerp(target, k);

    const wantOpacity = unfit ? 0.42 : 1;
    mat.opacity += (wantOpacity - mat.opacity) * k;

    const glow = selected && phase === "select" ? 0.65 : hovered ? 0.35 : unfit ? 0 : 0.05;
    mat.emissiveIntensity += (glow - mat.emissiveIntensity) * k;
    mat.emissive.lerp(new THREE.Color(phase === "select" && selected ? "#06b6d4" : "#22c55e"), k);
  });

  return (
    <group>
      <mesh
        ref={ref}
        geometry={geometry}
        position={[table.pos_x, TABLE_HEIGHT / 2, table.pos_z]}
        rotation={[0, table.rot_y, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(table.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
          document.body.style.cursor = "auto";
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          color={TABLE_STATUS_COLOR[table.status]}
          transparent
          opacity={1}
          roughness={0.55}
        />
      </mesh>

      {selected && phase === "select" && <SelectRing table={table} />}

      {!inGroup && (
        <Label
          x={table.pos_x}
          z={table.pos_z}
          text={table.label}
          sub={`seats ${table.capacity}`}
          dim={unfit}
        />
      )}
    </group>
  );
}

/** The amber "picked for merge" ring, pulsing on the floor. */
function SelectRing({ table }: { table: DemoTable }) {
  const ref = useRef<THREE.Mesh>(null);
  const r = Math.max(table.width, table.depth) / 2 + 0.26;
  useFrame((s) => {
    if (!ref.current) return;
    const p = 1 + Math.sin(s.clock.elapsedTime * 4) * 0.06;
    ref.current.scale.setScalar(p);
  });
  return (
    <mesh ref={ref} position={[table.pos_x, 0.02, table.pos_z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r + 0.07, 40]} />
      <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} transparent opacity={0.95} />
    </mesh>
  );
}

/**
 * The merged footprint — the same convex hull, expanded by the same margin,
 * as `GroupHull` draws on a real floor. It scales up from the centroid so the
 * merge reads as one shape forming rather than a shape appearing.
 */
function Hull({ phase }: { phase: Phase }) {
  const members = TABLES.filter((t) => MERGE_IDS.includes(t.id));
  const { geometry, center } = useMemo(() => {
    const pts = members.flatMap((t) => tableCorners(t));
    const hull = expandHull(convexHull(pts), 0.35);
    const c = centroid(hull);
    const shape = new THREE.Shape(hull.map(([x, z]) => new THREE.Vector2(x, z)));
    return { geometry: new THREE.ShapeGeometry(shape), center: c };
  }, [members]);

  const ref = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const on = phase === "merged" || phase === "seated";

  useFrame((_, dt) => {
    if (!ref.current || !matRef.current) return;
    const k = 1 - Math.pow(0.002, dt);
    const want = on ? 1 : 0.4;
    ref.current.scale.x += (want - ref.current.scale.x) * k;
    ref.current.scale.z += (want - ref.current.scale.z) * k;
    matRef.current.opacity += ((on ? 0.45 : 0) - matRef.current.opacity) * k;
    matRef.current.color.lerp(
      new THREE.Color(TABLE_STATUS_COLOR[phase === "seated" ? "occupied" : "free"]),
      k
    );
  });

  return (
    <group>
      <group ref={ref} position={[center.x, 0, center.z]} scale={[0.4, 1, 0.4]}>
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[-center.x, 0.03, -center.z]}>
          <meshStandardMaterial
            ref={matRef}
            color={TABLE_STATUS_COLOR.free}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      {on && <Label x={center.x} z={center.z} text="T4+T5" sub="seats 8" accent />}
    </group>
  );
}

/**
 * DOM labels rather than troika text: they inherit the site's webfonts, stay
 * crisp at any zoom, and need no font fetch inside the canvas.
 */
function Label({
  x,
  z,
  text,
  sub,
  dim = false,
  accent = false,
}: {
  x: number;
  z: number;
  text: string;
  sub: string;
  dim?: boolean;
  accent?: boolean;
}) {
  return (
    <Html position={[x, 1.15, z]} center distanceFactor={9} zIndexRange={[10, 0]} pointerEvents="none">
      <div
        className="pointer-events-none select-none text-center leading-none transition-opacity duration-500"
        style={{ opacity: dim ? 0.3 : 1 }}
      >
        <div
          className="u-mono text-[13px] font-bold tracking-tight"
          style={{
            color: accent ? "#fde68a" : "#f8fafc",
            textShadow: "0 1px 6px rgba(2,6,15,0.95), 0 0 2px rgba(2,6,15,1)",
          }}
        >
          {text}
        </div>
        <div
          className="mt-[3px] text-[9px] font-medium"
          style={{ color: "#cbd5e1", textShadow: "0 1px 5px rgba(2,6,15,0.95)" }}
        >
          {sub}
        </div>
      </div>
    </Html>
  );
}

/** One instanced draw call for every chair, exactly as the product does it. */
function Chairs() {
  const transforms = useMemo(() => TABLES.flatMap((t) => seatTransformsFor(t)), []);
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    transforms.forEach((t, i) => {
      q.setFromAxisAngle(axis, t.rotY);
      m.compose(new THREE.Vector3(t.x, SEAT_HEIGHT / 2, t.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, transforms.length]}>
      <cylinderGeometry args={[0.13, 0.16, SEAT_HEIGHT, 8]} />
      <meshStandardMaterial color="#3f3a34" roughness={0.95} metalness={0.05} />
    </instancedMesh>
  );
}

/** Slow idle orbit that hands control to the visitor the moment they touch it. */
function Orbiter({ paused }: { paused: boolean }) {
  const ref = useRef<{ setAzimuthalAngle: (a: number) => void; getAzimuthalAngle: () => number }>(null);
  const [dragging, setDragging] = useState(false);

  useFrame((_, dt) => {
    if (paused || dragging || !ref.current) return;
    ref.current.setAzimuthalAngle(ref.current.getAzimuthalAngle() + dt * 0.075);
  });

  return (
    <OrbitControls
      ref={ref as never}
      onStart={() => setDragging(true)}
      onEnd={() => setDragging(false)}
      enablePan={false}
      minDistance={7}
      maxDistance={17}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2.35}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

function Scene({ phase }: { phase: Phase }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 9, 4]} intensity={0.95} />
      <directionalLight position={[-6, 6, -4]} intensity={0.28} />

      {/* The floor slab, the same #1e2530 as the real Room. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 14]} />
        <meshStandardMaterial color="#1e2530" roughness={0.95} />
      </mesh>

      <Grid
        position={[0, 0.008, 0]}
        args={[15, 14]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={1}
        sectionThickness={0.7}
        sectionColor="#3f4a5c"
        fadeDistance={26}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />

      <Chairs />
      <Hull phase={phase} />
      {TABLES.map((t) => (
        <Table key={t.id} table={t} phase={phase} hovered={hovered === t.id} onHover={setHovered} />
      ))}

      <ContactShadows position={[0, 0.002, 0]} opacity={0.4} scale={20} blur={2.4} far={3} resolution={256} />

      <Orbiter paused={hovered !== null} />
    </>
  );
}

export function Floor3DDemo({ onPhase }: { onPhase?: (p: Phase) => void }) {
  const [i, setI] = useState(0);
  const phase = SCRIPT[i].phase;

  useEffect(() => {
    onPhase?.(phase);
    const t = setTimeout(() => setI((v) => (v + 1) % SCRIPT.length), SCRIPT[i].ms);
    return () => clearTimeout(t);
  }, [i, phase, onPhase]);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [8.5, 7, 8.5], fov: 42, near: 0.1, far: 200 }}
      style={{ background: "#1e2530" }}
    >
      <Scene phase={phase} />
    </Canvas>
  );
}
