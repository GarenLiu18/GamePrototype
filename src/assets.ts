import Phaser from 'phaser'

// Complete file groups verified against public/assets, in numeric order.
const action = (name: string, files: string[], loop: boolean, frameRate = 10, character = 'Avatar') => ({
  key: `anim/${character}/${name}`,
  frames: files.map(file => `sprites/${character}/${name}/${file}`),
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
  Knockback: action('Knockback', [
    'Knockback01', 'Knockback02', 'Knockback03', 'Knockback04', 'Knockback05', 'Knockback06',
  ], false, 20),
  GunFire: action('Combat/GunFire', ['GunFire01', 'GunFire02', 'GunFire03', 'GunFire04', 'GunFire05'], false, 20),
  GunRunFire: action('Combat/GunRunFire', [
    'GunRunFire01', 'GunRunFire02', 'GunRunFire03', 'GunRunFire04',
    'GunRunFire05', 'GunRunFire06', 'GunRunFire07', 'GunRunFire08',
  ], false, 20),
  GunReload: action('Combat/GunReload', [
    'GunReload01', 'GunReload02', 'GunReload03', 'GunReload04', 'GunReload05',
    'GunReload06', 'GunReload07', 'GunReload08', 'GunReload09',
  ], false, 10),
  ThrowUnderarm: action('Combat/ThrowUnderarm', [
    'ThrowUnderarm01', 'ThrowUnderarm02', 'ThrowUnderarm03',
    'ThrowUnderarm04', 'ThrowUnderarm05', 'ThrowUnderarm06',
  ], false, 10),
  GroundSlam: action('Combat/GroundSlam', [
    'GroundSlam04', 'GroundSlam05', 'GroundSlam06', 'GroundSlam07',
    'GroundSlam08', 'GroundSlam09', 'GroundSlam10',
  ], false, 12),
  Struggle: action('Fishing/Struggle', ['Struggle01', 'Struggle02', 'Struggle03'], true, 10),
  Push: action('Push', [
    'Push01', 'Push02', 'Push03', 'Push04', 'Push05', 'Push06', 'Push07', 'Push08',
  ], true, 16),
  PushIdle: action('PushIdle', [
    'PushIdle01', 'PushIdle02', 'PushIdle03', 'PushIdle04', 'PushIdle05', 'PushIdle06',
  ], true, 10),
  SwordComboA: action('Combat/SwordComboA', [
    'SwordCombo0101', 'SwordCombo0102', 'SwordCombo0103',
    'SwordCombo0104', 'SwordCombo0105', 'SwordCombo0106',
  ], false),
  BowAim: action('Combat/BowAim', ['BowAim01', 'BowAim02', 'BowAim03', 'BowAim04'], false),
  Die: action('Die', [
    'Die01', 'Die02', 'Die03', 'Die04', 'Die05', 'Die06', 'Die07', 'Die08', 'Die09',
  ], false),
  Spin: action('Spin', [
    'Spin01', 'Spin02', 'Spin03', 'Spin04', 'Spin05', 'Spin06', 'Spin07', 'Spin08',
  ], false, 14),
}

export const bulletAction = action('Weapons/Bullet', ['Bullet01', 'Bullet02'], true, 20)
export const allyArrowTexture = 'sprites/Avatar/Weapons/Arrow/Arrow01'
export const enemyProjectileAction = action('Effects/Projectile', [
  'Projectile01', 'Projectile02', 'Projectile03', 'Projectile04',
], true, 12, 'Enemy')
export const busTexture = 'images/Vehicles_BusWhite_Idle'
export const enemyActions = {
  Walk: action('Walk', ['Walk01', 'Walk02', 'Walk03', 'Walk04', 'Walk05', 'Walk06', 'Walk07', 'Walk08'], true, 10, 'Enemy'),
  Idle: action('Idle', ['Idle01', 'Idle02', 'Idle03', 'Idle04', 'Idle05', 'Idle06', 'Idle07'], true, 10, 'Enemy'),
  PowerUp: action('PowerUp', [
    'PowerUp01', 'PowerUp02', 'PowerUp03', 'PowerUp04', 'PowerUp05', 'PowerUp06', 'PowerUp07',
  ], true, 10, 'Enemy'),
  Vanish: action('Vanish', [
    'Vanish01', 'Vanish02', 'Vanish03', 'Vanish04', 'Vanish05', 'Vanish06', 'Vanish07',
  ], false, 10, 'Enemy'),
  Appear: action('Appear', [
    'Appear01', 'Appear02', 'Appear03', 'Appear04', 'Appear05',
    'Appear06', 'Appear07', 'Appear08', 'Appear09', 'Appear10',
  ], false, 10, 'Enemy'),
  Attack: action('Attack', ['Attack01', 'Attack02', 'Attack03', 'Attack04', 'Attack05', 'Attack06'], false, 10, 'Enemy'),
  BlastCharge: action('BlastCharge', [
    'BlastCharge01', 'BlastCharge02', 'BlastCharge03', 'BlastCharge04', 'BlastCharge05', 'BlastCharge06',
  ], false, 10, 'Enemy'),
  BlastAttack: action('BlastAttack', [
    'BlastAttack01', 'BlastAttack02', 'BlastAttack03', 'BlastAttack04', 'BlastAttack05',
  ], false, 10, 'Enemy'),
  Die: action('Die', ['Die01', 'Die02', 'Die03', 'Die04', 'Die05', 'Die06', 'Die07'], false, 10, 'Enemy'),
}

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
  const keys = [busTexture, allyArrowTexture, ...backgrounds.map(layer => layer.key),
    ...Object.values(avatarActions).flatMap(a => a.frames),
    ...Object.values(enemyActions).flatMap(a => a.frames), ...bulletAction.frames, ...enemyProjectileAction.frames]
  for (const key of keys) {
    if (!scene.textures.exists(key)) scene.load.image(key, `${base}assets/${key}.png`)
  }
}

export function registerAnimations(scene: Phaser.Scene): void {
  const bus = scene.textures.get(busTexture)
  if (!bus.has('vehicle')) bus.add('vehicle', 0, 22, 18, 132, 46)
  for (const animation of [...Object.values(avatarActions), ...Object.values(enemyActions)]) {
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
  const arrow = scene.textures.get(allyArrowTexture)
  if (!arrow.has('projectile')) arrow.add('projectile', 0, 42, 42, 23, 5)
  // Shared visible bounds of all four enemy projectile frames (right-facing).
  for (const key of enemyProjectileAction.frames) {
    const texture = scene.textures.get(key)
    if (!texture.has('projectile')) texture.add('projectile', 0, 30, 54, 39, 7)
  }
  if (!scene.anims.exists(enemyProjectileAction.key)) {
    scene.anims.create({
      key: enemyProjectileAction.key,
      frames: enemyProjectileAction.frames.map(key => ({ key, frame: 'projectile' })),
      frameRate: enemyProjectileAction.frameRate, repeat: enemyProjectileAction.repeat,
    })
  }
}
