"use client";

import { useEffect, useRef, useState } from "react";

/** LavaShaderBackground — molten-fire hero background for the landing.
 *
 *  A full-screen WebGL fragment shader. The look is Inigo Quilez domain
 *  warping (fbm of fbm of fbm): each noise layer distorts the coordinates
 *  of the next, which is what reads as flowing, undulating magma rather
 *  than static noise. Time translates the domain so the lava "walks"
 *  forever without buffering previous frames.
 *
 *  Palette is the repo's own: iai-bg navy (#091B36) as the cold base,
 *  iai-fire (#FF5C28) bleeding through, iai-ember (#FFB347) at the hot
 *  crests — fire emerging from the dark, not orange-on-black.
 *
 *  Renders behind content via the repo's standard background layer
 *  (fixed inset-0, z-index -1, pointer-events none), matching the
 *  .iai-landing-shell::before glow it sits beside.
 *
 *  Degrades gracefully: no WebGL context (or context loss) → a static CSS
 *  gradient that approximates the look; prefers-reduced-motion → one
 *  rendered frame, no animation loop; hidden tab → loop paused.
 */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 3.0;
  float t = u_time * 0.18;

  // Domain warping (iquilezles.org/articles/warp): fbm of fbm of fbm.
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.12 * t));
  float f = fbm(p + 4.0 * r + vec2(0.0, -t));
  f = clamp(f * f * 1.4, 0.0, 1.0);

  vec3 navy  = vec3(0.035, 0.106, 0.212); // #091B36
  vec3 fire  = vec3(1.000, 0.361, 0.157); // #FF5C28
  vec3 ember = vec3(1.000, 0.702, 0.278); // #FFB347

  vec3 col = navy;
  col = mix(col, fire, smoothstep(0.30, 0.70, f));
  col = mix(col, ember, smoothstep(0.72, 0.96, f) * 0.85);

  // Heat the crests, keep the troughs cold.
  col *= 0.6 + 0.5 * f;

  // Vignette so content stays legible toward the edges.
  float vig = smoothstep(1.25, 0.35, length(uv - 0.5));
  col *= 0.5 + 0.5 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function LavaShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext("webgl", { antialias: false, alpha: false }) as
        | WebGLRenderingContext
        | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }
    const prog = gl.createProgram();
    if (!prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    // Full-screen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr());
      const h = Math.floor(window.innerHeight * dpr());
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      gl.uniform1f(uTime, 12.0); // a pleasant frozen frame
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  if (failed) {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 100%, rgb(var(--color-iai-fire-rgb) / 0.45), transparent 55%), radial-gradient(80% 60% at 30% 80%, #FFB34733, transparent 60%), #091B36",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
