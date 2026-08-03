"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { cellToWorld } from "@/game/board";
import type { BoardDims } from "@/game/types";
import type { SliceAxis } from "./facingSliceAxis";
import { useSliceHighlightStore } from "./sliceHighlightStore";

type GridProps = {
  dims: BoardDims;
  spacing?: number;
};

type DepthUniforms = {
  uCamPos: { value: Vector3 };
  uNear: { value: number };
  uFar: { value: number };
  uSliceAxis: { value: Vector3 };
  uSlicePos: { value: number };
  uSliceActive: { value: number };
  uSliceFalloff: { value: number };
};

function axisUnit(axis: SliceAxis): Vector3 {
  if (axis === "x") return new Vector3(1, 0, 0);
  if (axis === "y") return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

function sliceWorldPos(
  axis: SliceAxis,
  index: number,
  dims: BoardDims,
  spacing: number,
): number {
  const cell =
    axis === "x"
      ? { x: index, y: 0, z: 0 }
      : axis === "y"
        ? { x: 0, y: index, z: 0 }
        : { x: 0, y: 0, z: index };
  const [cx, cy, cz] = cellToWorld(cell, dims, spacing);
  if (axis === "x") return cx;
  if (axis === "y") return cy;
  return cz;
}

/**
 * Cell-boundary lattice (N+1 planes per axis) so an N³ board reads as N cells,
 * not N−1.
 *
 * Opacity falls off with camera distance and softens away from the locked
 * placement slice (face chosen at place time) so large boards stay readable.
 */
export function Grid({ dims, spacing = 1 }: GridProps) {
  const materialRef = useRef<LineBasicMaterial>(null);
  const depthUniformsRef = useRef<DepthUniforms | null>(null);
  const camWorld = useMemo(() => new Vector3(), []);
  const slice = useSliceHighlightStore((s) => s.slice);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const hx = (dims.x * spacing) / 2;
    const hy = (dims.y * spacing) / 2;
    const hz = (dims.z * spacing) / 2;

    // Planes of constant X (dims.x + 1)
    for (let i = 0; i <= dims.x; i++) {
      const px = i * spacing - hx;
      for (let j = 0; j <= dims.y; j++) {
        const py = j * spacing - hy;
        positions.push(px, py, -hz, px, py, hz);
      }
      for (let k = 0; k <= dims.z; k++) {
        const pz = k * spacing - hz;
        positions.push(px, -hy, pz, px, hy, pz);
      }
    }
    // Planes of constant Y — remaining edges not already drawn as X-plane spans
    for (let j = 0; j <= dims.y; j++) {
      const py = j * spacing - hy;
      for (let k = 0; k <= dims.z; k++) {
        const pz = k * spacing - hz;
        positions.push(-hx, py, pz, hx, py, pz);
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geo;
  }, [dims.x, dims.y, dims.z, spacing]);

  const maxDim = Math.max(dims.x, dims.y, dims.z) * spacing;
  const fadeNear = maxDim * 0.45;
  const fadeFar = maxDim * 2.35;
  const sliceFalloff = spacing * 1.75;

  useLayoutEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;

    mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      const depthUniforms: DepthUniforms = {
        uCamPos: { value: new Vector3() },
        uNear: { value: fadeNear },
        uFar: { value: fadeFar },
        uSliceAxis: { value: new Vector3(0, 0, 1) },
        uSlicePos: { value: 0 },
        uSliceActive: { value: 0 },
        uSliceFalloff: { value: sliceFalloff },
      };
      Object.assign(shader.uniforms, depthUniforms);
      depthUniformsRef.current = depthUniforms;

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform vec3 uCamPos;
           uniform float uNear;
           uniform float uFar;
           uniform vec3 uSliceAxis;
           uniform float uSlicePos;
           uniform float uSliceActive;
           uniform float uSliceFalloff;
           varying float vDepthFade;
           varying float vSliceFade;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
           float dist = distance( worldPos.xyz, uCamPos );
           vDepthFade = 1.0 - smoothstep( uNear, uFar, dist );
           float sliceDist = abs( dot( worldPos.xyz, uSliceAxis ) - uSlicePos );
           float sliceKeep = 1.0 - smoothstep( 0.0, uSliceFalloff, sliceDist );
           // Prefer the locked placement layer; keep the rest of the box readable.
           vSliceFade = mix( 1.0, mix( 0.7, 1.0, sliceKeep ), uSliceActive );`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying float vDepthFade;
           varying float vSliceFade;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           float depthKeep = mix( 0.38, 1.0, vDepthFade );
           diffuseColor.a *= depthKeep * vSliceFade;`,
        );
    };
    mat.needsUpdate = true;

    return () => {
      mat.onBeforeCompile = () => {};
      depthUniformsRef.current = null;
      mat.needsUpdate = true;
    };
    // Recompile only when board scale changes — slice/camera uniforms update in useFrame.
  }, [fadeNear, fadeFar, sliceFalloff]);

  useFrame(({ camera }) => {
    const uniforms = depthUniformsRef.current;
    if (!uniforms) return;
    camera.getWorldPosition(camWorld);
    uniforms.uCamPos.value.copy(camWorld);
    uniforms.uNear.value = fadeNear;
    uniforms.uFar.value = fadeFar;
    uniforms.uSliceFalloff.value = sliceFalloff;
    if (slice) {
      uniforms.uSliceAxis.value.copy(axisUnit(slice.axis));
      uniforms.uSlicePos.value = sliceWorldPos(slice.axis, slice.index, dims, spacing);
      uniforms.uSliceActive.value = 1;
    } else {
      uniforms.uSliceActive.value = 0;
    }
  });

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        ref={materialRef}
        color="#a8b6c4"
        transparent
        opacity={0.62}
        depthWrite={false}
      />
    </lineSegments>
  );
}
