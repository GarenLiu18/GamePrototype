import Phaser from 'phaser'

// Complete file groups verified against public/assets, in numeric order.
const action = (name: string, files: string[], loop: boolean, frameRate = 10) => ({
  key: `anim/Avatar/${name}`,
  frames: files.map(file => `sprites/Avatar/${name}/${file}`),
  // Adjustable prototype assumption: source images have no timing metadata.
  frameRate,
  repeat: loop ? -1 : 0,
})

export const avatarActions = {
  Idle: action('Idle', ['Idle01', 'Idle02', 'Idle03', 'Idle04', 'Idle05', 'Idle06', 'Idle07'], true),
  Run: action('Run', ['Run01', 'Run02', 'Run03', 'Run04', 'Run05', 'Run06', 'Run07', 'Run08'], true),
  JumpRise: action('JumpRise', ['JumpRise01'], false),
  JumpMid: action('JumpMid', ['JumpMid01'], false),
  JumpFall: action('JumpFall', ['JumpFall01'], false),
  GunFire: action('Combat/GunFire', ['GunFire01', 'GunFire02', 'GunFire03', 'GunFire04', 'GunFire05'], false, 20),
  GunRunFire: action('Combat/GunRunFire', [
    'GunRunFire01', 'GunRunFire02', 'GunRunFire03', 'GunRunFire04',
    'GunRunFire05', 'GunRunFire06', 'GunRunFire07', 'GunRunFire08',
  ], false, 20),
}

export const bulletAction = action('Weapons/Bullet', ['Bullet01', 'Bullet02'], true, 20)

export const backgrounds = [
  { key: 'images/Backgrounds_Sky', speed: 0.03 },
  { key: 'images/Backgrounds_Moon', speed: 0.04 },
  { key: 'images/Backgrounds_BuildingsFar', speed: 0.12 },
  { key: 'images/Backgrounds_BuildingsBack', speed: 0.22 },
  { key: 'images/Backgrounds_BuildingsMid', speed: 0.38 },
  { key: 'images/Backgrounds_BuildingsClose', speed: 0.6 },
]

export function loadAssets(scene: Phaser.Scene): void {
  const base = import.meta.env.BASE_URL
  const keys = [...backgrounds.map(layer => layer.key),
    ...Object.values(avatarActions).flatMap(a => a.frames), ...bulletAction.frames]
  for (const key of keys) {
    if (!scene.textures.exists(key)) scene.load.image(key, `${base}assets/${key}.png`)
  }
}

export function registerAnimations(scene: Phaser.Scene): void {
  for (const animation of Object.values(avatarActions)) {
    if (!scene.anims.exists(animation.key)) {
      scene.anims.create({
        key: animation.key, frames: animation.frames.map(key => ({ key })),
        frameRate: animation.frameRate, repeat: animation.repeat,
      })
    }
  }
  // Both bullet images are padded 96 x 84 canvases. Use the union of their visible
  // bounds as a texture frame so the projectile and its collision body align.
  for (const key of bulletAction.frames) {
    const texture = scene.textures.get(key)
    if (!texture.has('projectile')) texture.add('projectile', 0, 43, 44, 9, 2)
  }
  if (!scene.anims.exists(bulletAction.key)) {
    scene.anims.create({
      key: bulletAction.key,
      frames: bulletAction.frames.map(key => ({ key, frame: 'projectile' })),
      frameRate: bulletAction.frameRate, repeat: bulletAction.repeat,
    })
  }
}
