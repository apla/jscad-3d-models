// Torsion Spring Generator for JSCAD
// Parameters:
//   innerDiameter  - inner diameter of the spring coil (mm)
//   wireDiameter   - diameter of the wire (mm)
//   stepDistance   - pitch between coils (mm)
//   numCoils       - number of coils
//   type           - 'spring' | 'cutout'
//     'spring'  → generates a helical wire spring
//     'cutout'  → generates a cylinder with a square-section helical groove wound into it

const jscad = require('@jscad/modeling');
const { cylinder, cuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotate, rotateZ } = jscad.transforms;
const { degToRad } = jscad.utils;
const { colorize } = jscad.colors;

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a polyhedron from raw {positions, faces} via geom3 / polygon
 * JSCAD doesn't expose a polyhedron primitive, so we build a shell of
 * triangulated quads the hard way.
 */
function makeHelixTube(params) {
  const {
    innerRadius,  // helix centre-line radius
    wireRadius,   // tube radius around the centre-line
    stepDistance, // pitch per full turn
    numCoils,     // total turns
    radialSegs = 12, // segments around the wire cross-section
    axialSegs = 60,  // segments per coil
  } = params;

  const totalSteps = Math.round(numCoils * axialSegs);
  const angleStep  = (2 * Math.PI) / axialSegs;
  const zStep      = stepDistance / axialSegs;

  // Build a list of "rings" — each ring is radialSegs+1 vertices around the
  // wire at one step along the helix.
  const rings = [];
  for (let i = 0; i <= totalSteps; i++) {
    const theta = i * angleStep;          // helix angle
    const cx = innerRadius * Math.cos(theta);
    const cy = innerRadius * Math.sin(theta);
    const cz = i * zStep - (totalSteps * zStep) / 2; // centred on Z

    // Tangent direction along helix
    const tx = -Math.sin(theta);
    const ty =  Math.cos(theta);
    const tz = stepDistance / (2 * Math.PI * innerRadius); // rise/run
    const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz);

    // Normal (radial outward projected onto plane perpendicular to tangent)
    let nx = Math.cos(theta), ny = Math.sin(theta), nz = 0;
    const dot = nx*tx/tLen + ny*ty/tLen + nz*tz/tLen;
    nx -= dot*(tx/tLen); ny -= dot*(ty/tLen); nz -= dot*(tz/tLen);
    const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Binormal
    const bx = ty/tLen*nz - tz/tLen*ny;
    const by = tz/tLen*nx - tx/tLen*nz;
    const bz = tx/tLen*ny - ty/tLen*nx;

    const ring = [];
    for (let j = 0; j < radialSegs; j++) {
      const phi = (2 * Math.PI * j) / radialSegs;
      const cos = Math.cos(phi), sin = Math.sin(phi);
      ring.push([
        cx + wireRadius * (cos * nx + sin * bx),
        cy + wireRadius * (cos * ny + sin * by),
        cz + wireRadius * (cos * nz + sin * bz),
      ]);
    }
    rings.push(ring);
  }

  // Assemble faces (quads split into 2 triangles)
  const positions = rings.flat();
  const faces = [];
  const R = radialSegs;

  for (let i = 0; i < totalSteps; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + (j + 1) % R;
      const c = (i + 1) * R + (j + 1) % R;
      const d = (i + 1) * R + j;
      faces.push([a, b, c]);
      faces.push([a, c, d]);
    }
  }

  // Cap discs (fan triangulation)
  const bottomCenter = positions.length;
  positions.push(rings[0].reduce((s, v) => [s[0]+v[0]/R, s[1]+v[1]/R, s[2]+v[2]/R], [0,0,0]));
  for (let j = 0; j < R; j++) faces.push([bottomCenter, (j+1)%R, j]);

  const topCenter = positions.length;
  const tOff = totalSteps * R;
  positions.push(rings[totalSteps].reduce((s, v) => [s[0]+v[0]/R, s[1]+v[1]/R, s[2]+v[2]/R], [0,0,0]));
  for (let j = 0; j < R; j++) faces.push([topCenter, tOff+j, tOff+(j+1)%R]);

  return jscad.primitives.polyhedron({ points: positions, faces });
}

// ── main entry point (called by JSCAD) ─────────────────────────────────────

function getParameterDefinitions() {
  return [
    { name: 'type', type: 'choice', caption: 'Type',
      values: ['spring', 'cutout'], captions: ['Wire Spring', 'Cylinder with Cutout'],
      initial: 'spring' },
    { name: 'innerDiameter', type: 'float', initial: 20, caption: 'Inner Diameter (mm)', min: 2, max: 200, step: 0.5 },
    { name: 'wireDiameter',  type: 'float', initial: 2,  caption: 'Wire Diameter (mm)',  min: 0.5, max: 50, step: 0.1 },
    { name: 'stepDistance',  type: 'float', initial: 6,  caption: 'Step Distance / Pitch (mm)', min: 0.5, max: 100, step: 0.5 },
    { name: 'numCoils',      type: 'int',   initial: 5,  caption: 'Number of Coils', min: 1, max: 50 },
    { name: 'radialSegs',    type: 'int',   initial: 12, caption: 'Wire Radial Segments', min: 4, max: 32 },
    { name: 'axialSegs',     type: 'int',   initial: 60, caption: 'Axial Segments per Coil', min: 20, max: 120 },
  ];
}

function main(params) {
  const {
    type,
    innerDiameter,
    wireDiameter,
    stepDistance,
    numCoils,
    radialSegs,
    axialSegs,
  } = params;

  const innerRadius = innerDiameter / 2;
  const wireRadius  = wireDiameter  / 2;
  const totalHeight = stepDistance * numCoils;

  if (type === 'spring') {
    // ── Wire spring ────────────────────────────────────────────────────────
    const spring = makeHelixTube({
      innerRadius,
      wireRadius,
      stepDistance,
      numCoils,
      radialSegs,
      axialSegs,
    });
    return colorize([0.7, 0.75, 0.8, 1], spring);

  } else {
    // ── Cylinder with square-section helical cutout ────────────────────────
    // Outer cylinder
    const outerRadius = innerRadius + wireDiameter * 3; // generous wall
    const cyl = cylinder({ radius: outerRadius, height: totalHeight, segments: 64 });

    // We subtract a helix-shaped cuboid swept along the path.
    // Strategy: build many thin rectangular prisms at each step along the
    // helix and boolean-subtract them all from the cylinder.

    const steps = numCoils * axialSegs;
    const dAngle = (2 * Math.PI) / axialSegs;
    const dZ     = stepDistance / axialSegs;
    const cutters = [];

    // Width of cut = wireDiameter, depth = wireDiameter, length = small segment
    const segLen = (2 * Math.PI * innerRadius) / axialSegs * 1.05; // slight overlap

    for (let i = 0; i < steps; i++) {
      const theta = i * dAngle;
      const z = i * dZ - totalHeight / 2 + dZ / 2;

      // Thin rectangular cutter oriented tangentially along the helix
      const box = cuboid({ size: [segLen * 1.1, wireDiameter, wireDiameter + dZ * 0.5] });

      // Translate to the helix centre-line radius, then rotate to theta
      const moved = translate([innerRadius, 0, z],
        rotate([Math.atan2(dZ, 2 * Math.PI * innerRadius / axialSegs), 0, 0], box)
      );
      cutters.push(rotateZ(theta, moved));
    }

    const result = subtract(cyl, ...cutters);
    return colorize([0.55, 0.6, 0.65, 1], result);
  }
}

module.exports = { main, getParameterDefinitions };
