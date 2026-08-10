const { booleans, primitives, transforms } = require('@jscad/modeling');
const { subtract, union } = booleans;
const { cuboid, cylinder } = primitives;
const { translate, rotateX, rotateY, rotateZ, rotate } = transforms;

function parseHoleSpacing(spacingInput, defaultValue) {
  try {
    // Attempt to parse as JSON first (e.g., "[10, 15, 10]")
    const parsed = JSON.parse(spacingInput);
    if (Array.isArray(parsed)) {
      // Ensure all elements are numbers
      return parsed.map(Number);
    } else if (!isNaN(parsed)) {
      return parsed;
    }
  } catch (e) {
    return defaultValue;
  }
  return defaultValue;
}

function getHolePositions(holeCount, parsedSpacing) {
  const positions = [];
  let segments = [];

  // Determine the width of each block segment
  if (Array.isArray(parsedSpacing)) {
    segments = parsedSpacing;
  } else {
    // Uniform spacing implies equal-width segments
    segments = Array(Math.max(1, Math.floor(holeCount))).fill(parsedSpacing);
  }

  // The total length of the busbar interior is the sum of all segment widths
  const totalLength = segments.reduce((sum, val) => sum + val, 0);

  let currentX = 0;
  for (let i = 0; i < segments.length; i++) {
    // Position the hole right in the middle of its assigned segment
    positions.push(currentX + segments[i] / 2);
    currentX += segments[i];
  }

  // Center the positions around 0 (the origin of the outer cuboid)
  const offsetX = -totalLength / 2;
  
  return {
      positions: positions.map(pos => pos + offsetX),
      totalLength: totalLength
  };
}


function groundingBarShell ({innerWidth, innerHeight, wallThickness, holeDiameter, holeSpacing, holeCount, holeWallThickness, holeWallHeight, screwdriverD, innerLength, wireMode, screwMode, haveHagerMounts, innerExtra}) {
  const [innerExtraDepth, innerExtraHeight] = innerExtra;
  const outerW = innerWidth  + wallThickness * 2;
  const outerD = innerHeight  + wallThickness * 2 + (screwMode.block ? holeWallHeight : 0);

  const outer = translate(
    [0, -innerExtraDepth/2, innerExtraHeight/2 + (screwMode.block ? holeWallHeight/2 : 0)],
    cuboid({ size: [
      innerLength + wallThickness * 2,
      outerW + innerExtraDepth,
      outerD + innerExtraHeight
    ] })
  );
  const inner = cuboid({ size: [innerLength + wallThickness, innerWidth, innerHeight] });
  let shell = subtract(outer, translate([wallThickness, 0, 0], inner));

  const holeDepth  = wireMode === "passThrough" ? outerD + 2 : wallThickness + 2;
  const holeHeight  = wallThickness + holeWallHeight;
  const holeRadius = holeDiameter / 2;
  
  const defaultHoleSpacing = 9;
  const parsedSpacing = parseHoleSpacing(holeSpacing, defaultHoleSpacing);
  
  const { positions } = getHolePositions(holeCount, parsedSpacing);
  const actualHoleCount = positions.length;

  
    if (haveHagerMounts) {

      // Hager mounts are 9.8mm wide,
      // with distance between them to match 15mm mounting holes,
      // ex mount + distance + mount be in range [30, 45, 60]
      const hagerMountWidth = 9.8;
      const hagerMountDistanceMultiplier = Math.trunc((innerLength + wallThickness * 2) / 15);
      const HagerMountDistanceBetween = 15 * (hagerMountDistanceMultiplier + 1) - hagerMountWidth * 2;
      
      shell = union(shell, 
        // leg 1
        translate([innerLength/2 + wallThickness - hagerMountWidth/2, 7/2 + innerWidth/2 + wallThickness, - 5/2 + holeWallHeight + innerHeight/2  + wallThickness],
          union(
            cuboid({size: [hagerMountWidth, 7, 5]}),
            translate([0, 2, -6.5], cuboid({size: [hagerMountWidth, 3, 8]}))
          )
        ),
        // leg 2
        translate([-(HagerMountDistanceBetween/2 - hagerMountWidth/2), 7/2 + innerWidth/2 + wallThickness, - 5/2 + holeWallHeight + innerHeight/2  + wallThickness],
          union(
            cuboid({size: [hagerMountWidth, 7, 5]}),
            translate([0, 2, -6.5], cuboid({size: [hagerMountWidth, 3, 8]}))
          )
        ),
        // ears on top
        translate([innerLength/2 + wallThickness - 1.5/2, - 4/2 + innerWidth/2 + wallThickness, - 2.5/2 - innerHeight/2  - wallThickness],
          cuboid({size: [1.5, 4, 2.5]})
        ),
        translate([-(HagerMountDistanceBetween/2 - 1.5/2), - 4/2 + innerWidth/2 + wallThickness, - 2.5/2 - innerHeight/2  - wallThickness],
          cuboid({size: [1.5, 4, 2.5]})
        ),
        // lock #1
        // hager mount width should be at least 45mm
        translate([innerLength/2 + wallThickness - 15 - 15/2, innerWidth/2 + wallThickness - 0.5, - 5 - 4 + holeWallHeight + innerHeight/2  + wallThickness],
          union(
            rotate([0, Math.PI/2, 0],
              cylinder({ radius: 1.5, height: 6, segments: 32 })
            )
          )
        ),
        // hager mount width should be at least 45mm
        // translate([innerLength/2 + wallThickness - 30 - 15/2, innerWidth/2 + wallThickness - 0.25, - 5 - 3.5 + holeWallHeight + innerHeight/2  + wallThickness],
        //   union(
        //     rotate([0, Math.PI/2, 0],
        //       cylinder({ radius: 2, height: 10, segments: 32 })
        //     )
        //   )
        // ),
        // lock #2
        translate([-(HagerMountDistanceBetween/2 - 15 - 15/2), innerWidth/2 + wallThickness - 0.25, - 5 - 3.5 + holeWallHeight + innerHeight/2  + wallThickness],
          union(
            rotate([0, Math.PI/2, 0],
              cylinder({ radius: 1.5, height: 6, segments: 32 })
            )
          )
        ),
      );

      
    }

  
  for (let i = 0; i < actualHoleCount; i++) {
    const x = positions[i];
    const zOffset = wireMode === "passThrough" ? 0 : (outerD / 2 - holeDepth / 2 + 1);
    const yOffset = wireMode === "passThrough" ? 0 : (outerW / 2 - holeDepth / 2 + 1);
    
    const screwHole = translate(
      [x, 0, holeHeight/2 + outerD/2 + (screwMode.protruding ? 0 : -holeWallHeight)],
      subtract(
        cylinder({ radius: screwdriverD/2, height: holeDepth + 2 + holeWallHeight, segments: 32 })
      )
    );
    const screwHoleWall = translate(
      [x, 0, holeWallHeight/2 + innerHeight/2 + wallThickness],
      subtract(
        cylinder({ radius: screwdriverD/2 + holeWallThickness, height: holeWallHeight, segments: 32 })
      )
    );
    const wireHole = translate(
      [x, yOffset, 0],
      rotateX(
        Math.PI/2,
        cylinder({ radius: holeRadius, height: holeDepth + 2 + holeHeight, segments: 32 })
      )
    );
    shell = union(shell, screwHoleWall);
    shell = subtract(shell, screwHole);
    shell = subtract(shell, wireHole);
  }
  return shell;
};

const templates = {
  simple: {
    innerWidth: 6.5,
    innerLength: 108,
    innerHeight: 9,
    wallThickness: 2,

    holeDiameter: 6,
    holeSpacing: "8.5",
    holeCount: 12,
    holeWallThickness: 1,
    holeWallHeight: 5,
    screwdriverD: 7,
  },
  "two-level": {
    innerWidth: 10,
    innerLength: 27,
    innerHeight: 11,
    wallThickness: 2,

    holeDiameter: 8.5,
    holeSpacing: "8",
    holeCount: 3,
    holeWallThickness: 1,
    holeWallHeight: 5,
    screwdriverD: 7,

    innerExtra: [10, 0],
  }
};

const defaultTemplateName = "two-level";
const defaults = templates[defaultTemplateName];

function getParameterDefinitions () {
  return [
    {name: 'bar_brass_group', type: 'group', caption: 'Bar brass'},
    {name: 'innerWidth', caption: 'Brass bar width:', type: 'float', step: 0.1, initial: defaults.innerWidth},
    {name: 'innerLength', caption: 'Brass bar length:', type: 'float', step: 0.1, initial: defaults.innerLength},
    {name: 'innerHeight', caption: 'Brass bar height:', type: 'float', step: 0.1, initial: defaults.innerHeight},
    {name: 'wallThickness', caption: 'Wall Thickness:', type: 'float', step: 0.1, initial: defaults.wallThickness},

    {name: 'holes_group', type: 'group', caption: 'Holes'},
    {name: 'holeDiameter', caption: 'Hole diameter:', type: 'float', step: 0.1, initial: defaults.holeDiameter},
    {name: 'holeSpacing', caption: 'Hole spacing (number or array like [10, 20]):', type: 'string', initial: defaults.holeSpacing},
    {name: 'holeCount', caption: 'Hole count:', type: 'float', step: 1, initial: defaults.holeCount},
    {name: 'holeWallThickness', caption: 'Hole protection wall thickness:', type: 'float', step: 0.1, initial: defaults.holeWallThickness},
    {name: 'holeWallHeight', caption: 'Hole protection wall H:', type: 'float', step: 0.1, initial: defaults.holeWallHeight},
    {name: 'screwdriverD', caption: 'Screwdriver diameter:', type: 'float', step: 0.1, initial: defaults.screwdriverD},

    {name: 'hager_group', type: 'group', caption: 'Hager'},
    {name: 'haveHagerMounts', caption: 'Use Hager mounts:', type: 'checkbox', initial: true},
    // {name: 'holeSpacing', caption: 'Hole spacing (number or array like [10, 20]):', type: 'string', initial: "8.5"},
    // {name: 'holeCount', caption: 'Hole count:', type: 'float', step: 1, initial: 12},
    // {name: 'holeWallThickness', caption: 'Hole protection wall thickness:', type: 'float', step: 0.1, initial: 1},
    // {name: 'holeWallHeight', caption: 'Hole protection wall H:', type: 'float', step: 0.1, initial: 5},
    // {name: 'screwdriverD', caption: 'Screwdriver diameter:', type: 'float', step: 0.1, initial: 7},

   ];
}

function main (params) {
  const defaultHoleSpacing = 9;
  const parsedSpacing = parseHoleSpacing(params.holeSpacing, defaultHoleSpacing);
  
  // innerLength seamlessly scales using the sum of the blocks' widths
  const { totalLength } = getHolePositions(params.holeCount, parsedSpacing);

  // Hager mounts should be 28mm inside + 5mm overhang
  const totalHeight = params.innerHeight + params.wallThickness * 2 + params.holeWallHeight;
  const hagerMountBodyHeight = 33;
  const holeWallHeightAdjust = params.haveHagerMounts ? hagerMountBodyHeight - totalHeight : 0;
  const holeWallHeight = params.holeWallHeight + holeWallHeightAdjust;
  
  const innerLength = Math.max(totalLength, params.innerLength);
  const wireMode = "passThrough";
  const screwMode = {protruding: true, block: true};

  const innerExtra = defaults.innerExtra || [0, 0];

  let bar = groundingBarShell({
      innerLength,
      wireMode,
      screwMode,
      ...params,
      holeWallHeight,
      innerExtra,
    });

  if (defaults.innerExtra) {
    bar = union(subtract(
      bar,
      translate([params.wallThickness, 0, 0], union(
        translate([0, -4.6, 9.2], cuboid({size: [innerLength + params.wallThickness, 19.2, 7.5]})),
        translate([0, -9.45, 16.4], cuboid({size: [innerLength + params.wallThickness, 9.5, 7]})),
      )),
      union(
        translate([9, -9.45, 28], cylinder({ radius: 5.5/2, height: 40, segments: 32 })),
        translate([3, -9.45, 28], cylinder({ radius: 5.5/2, height: 40, segments: 32 })),
        translate([-3, -9.45, 28], cylinder({ radius: 5.5/2, height: 40, segments: 32 })),
        translate([-9, -9.45, 28], cylinder({ radius: 5.5/2, height: 40, segments: 32 })),
      ),
      union(
        translate([9, -11, 12], rotateX(Math.PI/2, cylinder({ radius: 5.5/2, height: 12, segments: 32 }))),
        translate([3, -11, 12], rotateX(Math.PI/2, cylinder({ radius: 5.5/2, height: 12, segments: 32 }))),
        translate([-3, -11, 12], rotateX(Math.PI/2, cylinder({ radius: 5.5/2, height: 12, segments: 32 }))),
        translate([-9, -11, 12], rotateX(Math.PI/2, cylinder({ radius: 5.5/2, height: 12, segments: 32 }))),
      )
    ),
    );
  }
  
  return [
    rotateY(Math.PI, bar),
    // translate([0, innerLength, 0],
    //   cuboid({size: [params.innerHeight, params.innerWidth, params.wallThickness]})
    // )
  ];
}

function mainX (params) {
  const {holeCount, holeDiameter} = params;
  const defaultHoleSpacing = 9;
  const parsedSpacing = parseHoleSpacing(params.holeSpacing, defaultHoleSpacing);
  
  const { positions, totalLength } = getHolePositions(holeCount, parsedSpacing);
  
  const holderLength = totalLength;
  const barWidth = holeDiameter;
  let shell = cuboid({ size: [holderLength, barWidth, barWidth * 1.25] });

  for (let i = 0; i < positions.length; i++) {
    const x = positions[i];
    const wireHole = translate(
      [x, 0, barWidth/4],
      rotateX(
        Math.PI/2,
        cylinder({ radius: holeDiameter/2, height: barWidth, segments: 32 })
      )
    );
    const wireEnterReduce = 0.2;
    const wireEnter = translate(
      [x, 0, barWidth/6*5],
      cuboid({ size: [holeDiameter - wireEnterReduce, holeDiameter, holeDiameter] })
    );
    shell = subtract(shell, wireHole);
    shell = subtract(shell, wireEnter);
  }
  return shell;
}

module.exports = { main, getParameterDefinitions };
