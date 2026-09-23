// Change enabled to false to disable the entire system, then reload the game.
export const unitProgressionConfig = {
  enabled: true,
  maxLevel: 5,
  firstLevelKillRequirement: 2,
  additionalKillsPerLevel: 2,
  sizeIncreasePerLevel: 0.08,
  // Add a percentage of the level-0 base stat per level (not compounded).
  attackIncreasePerLevel: 0.10,
  healthIncreasePerLevel: 0.10,
  // Level 0 has no star.
  // Level 1 through 5: bronze, green, blue, red, yellow.
  starColors: [0xcd7f32, 0x4ade80, 0x60a5fa, 0xf87171, 0xfacc15],
}
