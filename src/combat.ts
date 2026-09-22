import Phaser from 'phaser'
import { avatarActions, enemyActions } from './assets'

export type EnemyKind = 'melee' | 'ranged'

export const combatConfig = {
  playerHealth: 100, busHealth: 300, enemyHealth: 60, bulletDamage: 20,
  enemyDamage: 10, busDamage: 20, enemySpeed: 65, attackRange: 58,
  attackWindup: 200, attackDuration: 600, attackCooldown: 1000,
  playerInvulnerability: 1200, playerBlinkInterval: 100,
  playerKnockbackSpeed: 260, playerKnockbackLift: 180,
  rangedRange: 520, rangedVerticalRange: 300, rangedCooldown: 2200,
  combatStagger: { spacing: 8, jitter: 2, maxAdvance: 32 },
  projectileGravity: 650, projectileSpeed: 380, projectileLifetime: 3500,
  waveInterval: 15000,
  boss: {
    health: 1200,
    scale: 4.8,
    patrolRadius: 180,
    patrolSpeed: 45,
    moveSpeed: 52,
    detectionRange: 1000,
    attackRange: 1200,
    hudRevealRange: 1450,
    lockDuration: 3000,
    volleySize: 10,
    arrowFloatDuration: 750,
    arrowScale: 5.4,
    arrowSpeedMultiplier: 2,
    attackCooldown: 4000,
    basicDamage: 20,
    basicArrowSpeedMultiplier: 2.5,
    finalRainWarningDuration: 1200,
    finalRainDuration: 5000,
    finalRainSettleDuration: 1200,
    finalRainInterval: 90,
    finalRainPerBurst: 6,
    finalRainDamage: 10,
    finalRainSpeed: 900,
  },
  waveCluster: {
    enemyCenter: 2345,
    allyCenter: 665,
    spacing: 28,
    jitter: 6,
    enemyLead: 900,
    edgePadding: 160,
  },
}

export type Bounds = { left: number; right: number; top: number; bottom: number }

// Spread a wave across distinct approach distances, then randomize who takes
// each position. Keep these offsets for the unit's lifetime to avoid jitter.
export function createCombatAdvances(count: number): number[] {
  const { spacing, jitter, maxAdvance } = combatConfig.combatStagger
  const step = count > 1 ? Math.min(spacing, maxAdvance / (count - 1)) : 0
  return Phaser.Utils.Array.Shuffle(Array.from({ length: count }, (_, index) =>
    Phaser.Math.Clamp(index * step + Phaser.Math.FloatBetween(-jitter, jitter), 0, maxAdvance)))
}

export function canShootFromLeft(enemy: Bounds, target: Bounds, range = combatConfig.rangedRange): boolean {
  const dx = (enemy.left + enemy.right - target.left - target.right) / 2
  const dy = (enemy.top + enemy.bottom - target.top - target.bottom) / 2
  return dx >= 48 && dx <= range && Math.abs(dy) <= combatConfig.rangedVerticalRange
}

export function canShootFromRight(ally: Bounds, target: Bounds, range = combatConfig.rangedRange): boolean {
  const dx = (target.left + target.right - ally.left - ally.right) / 2
  const dy = (target.top + target.bottom - ally.top - ally.bottom) / 2
  return dx >= 48 && dx <= range && Math.abs(dy) <= combatConfig.rangedVerticalRange
}

// Solve a ballistic arc to a snapshot of the target. No homing after release.
export function ballisticVelocity(x: number, y: number, targetX: number, targetY: number,
  speedMultiplier = 1) {
  const flightTime = Phaser.Math.Clamp(
    Math.abs(targetX - x) / combatConfig.projectileSpeed, 0.65, 1.15,
  ) / speedMultiplier
  return {
    x: (targetX - x) / flightTime,
    y: (targetY - y - 0.5 * combatConfig.projectileGravity * flightTime ** 2) / flightTime,
  }
}

// Enemies face left permanently. Only the forward horizontal strike band can hit.
export function canAttackFromLeft(enemy: Bounds, target: Bounds, range = combatConfig.attackRange): boolean {
  return (target.left + target.right) / 2 <= (enemy.left + enemy.right) / 2
    && target.right >= enemy.left - range
    && target.left <= enemy.left
    && target.bottom > enemy.bottom - 50
    && target.top < enemy.bottom - 16
}

export function canAttackFromRight(ally: Bounds, target: Bounds, range = combatConfig.attackRange): boolean {
  return (target.left + target.right) / 2 >= (ally.left + ally.right) / 2
    && target.left <= ally.right + range
    && target.right >= ally.right
    && target.bottom > ally.bottom - 50
    && target.top < ally.bottom - 16
}

export class HealthBar {
  private background: Phaser.GameObjects.Rectangle
  private fill: Phaser.GameObjects.Rectangle
  private label: Phaser.GameObjects.Text
  constructor(scene: Phaser.Scene, private width: number, private max: number, private name: string, color: number) {
    this.background = scene.add.rectangle(0, 0, width + 4, 8, 0x09111e).setDepth(20)
    this.fill = scene.add.rectangle(0, 0, width, 4, color).setOrigin(0, 0.5).setDepth(21)
    this.label = scene.add.text(0, 0, '', {
      fontFamily: '"Segoe UI", "Microsoft JhengHei", sans-serif', fontSize: '11px', color: '#e5efff',
      backgroundColor: '#09111e', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(21)
  }
  update(x: number, y: number, hp: number): void {
    this.background.setPosition(x, y)
    this.fill.setPosition(x - this.width / 2, y).setDisplaySize(this.width * Math.max(0, hp) / this.max, 4)
    this.label.setPosition(x, y - 7).setText(`${this.name} ${Math.max(0, hp)} / ${this.max}`)
  }
  setVisible(visible: boolean): void {
    this.background.setVisible(visible)
    this.fill.setVisible(visible)
    this.label.setVisible(visible)
  }
  destroy(): void { this.background.destroy(); this.fill.destroy(); this.label.destroy() }
}

export interface FriendlyTarget {
  hp: number
  readonly sprite: Phaser.Physics.Arcade.Sprite
  takeDamage(amount: number): void
}

export interface HostileTarget {
  hp: number
  readonly kind: EnemyKind | 'boss'
  readonly sprite: Phaser.Physics.Arcade.Sprite
  takeDamage(amount: number): void
}

export type EnemyTarget = 'player' | 'bus' | FriendlyTarget
type BossBasicTarget = { bounds: Bounds; isAlive: () => boolean }
export class Enemy implements HostileTarget {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly bar: HealthBar
  hp = combatConfig.enemyHealth
  private target: EnemyTarget | null = null
  private hitAt = 0
  private finishAt = 0
  private nextAttackAt = 0
  private hitApplied = false
  private rangedPhase: 'walk' | 'charge' | 'release' = 'walk'
  private rangedTarget: EnemyTarget | null = null
  constructor(private scene: Phaser.Scene, x: number, groundY: number, readonly kind: EnemyKind = 'melee',
    readonly combatAdvance = Phaser.Math.FloatBetween(0, combatConfig.combatStagger.maxAdvance)) {
    this.sprite = scene.physics.add.sprite(x, groundY, enemyActions.Walk.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setFlipX(true).setDepth(5)
    this.sprite.setSize(18, 44).setOffset(39, 40)
    this.sprite.setData('enemy', this)
    this.bar = new HealthBar(scene, 48, this.hp, kind === 'melee' ? '近戰' : '遠攻', kind === 'melee' ? 0xf47b86 : 0xffc477)
    this.sprite.play(enemyActions.Walk.key)
  }
  update(time: number, player: Bounds, bus: Bounds, allies: FriendlyTarget[], damage: (target: EnemyTarget) => void,
    launch: (enemy: Enemy, target: Bounds) => void): void {
    if (this.hp <= 0) return
    if (this.kind === 'ranged') {
      this.updateRanged(time, player, bus, allies, launch)
      this.bar.update(this.sprite.x, this.sprite.y - 87, this.hp)
      return
    }
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const bounds = (target: EnemyTarget) => target === 'player' ? player
      : target === 'bus' ? bus : target.sprite.body as Phaser.Physics.Arcade.Body
    const alive = (target: EnemyTarget) => typeof target === 'string' || target.hp > 0
    const inRange = (target: EnemyTarget) => alive(target) && canAttackFromLeft(body, bounds(target))
    // Abort immediately if the target jumps out of reach or passes behind us.
    if (this.target && !inRange(this.target)) this.target = null
    if (this.target) {
      this.sprite.setVelocityX(0)
      if (!this.hitApplied && time >= this.hitAt) {
        this.hitApplied = true
        if (inRange(this.target)) damage(this.target)
      }
      if (time >= this.finishAt) this.target = null
    } else {
      // Allied units always outrank the player and bus when one is inside the
      // forward strike band. Distance is only used to choose between allies.
      const ally = allies.filter(inRange).sort((a, b) => b.sprite.x - a.sprite.x)[0] ?? null
      const target: EnemyTarget | null = ally ?? (inRange('player') ? 'player' : inRange('bus') ? 'bus' : null)
      if (target && canAttackFromLeft(body, bounds(target), combatConfig.attackRange - this.combatAdvance)) {
        this.sprite.setVelocityX(0)
        if (time >= this.nextAttackAt) {
          this.target = target
          this.hitAt = time + combatConfig.attackWindup
          this.finishAt = time + combatConfig.attackDuration
          this.nextAttackAt = time + combatConfig.attackCooldown
          this.hitApplied = false
          this.sprite.play(enemyActions.Attack.key)
        } else this.sprite.play(enemyActions.Idle.key, true)
      } else {
        this.sprite.setVelocityX(-combatConfig.enemySpeed)
        this.sprite.play(enemyActions.Walk.key, true)
      }
    }
    this.bar.update(this.sprite.x, this.sprite.y - 87, this.hp)
  }

  private updateRanged(time: number, player: Bounds, bus: Bounds, allies: FriendlyTarget[],
    launch: (enemy: Enemy, target: Bounds) => void): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const bounds = (target: EnemyTarget) => target === 'player' ? player
      : target === 'bus' ? bus : target.sprite.body as Phaser.Physics.Arcade.Body
    const alive = (target: EnemyTarget) => typeof target === 'string' || target.hp > 0
    const reachable = (target: EnemyTarget) => alive(target) && canShootFromLeft(body, bounds(target))
    if (this.rangedPhase === 'charge') {
      if (!this.rangedTarget || !reachable(this.rangedTarget)) {
        this.rangedPhase = 'walk'
        this.rangedTarget = null
      } else if (!this.sprite.anims.isPlaying) {
        launch(this, bounds(this.rangedTarget))
        this.sprite.play(enemyActions.BlastAttack.key)
        this.rangedPhase = 'release'
        this.nextAttackAt = time + combatConfig.rangedCooldown
        return
      } else return
    }
    if (this.rangedPhase === 'release') {
      if (this.sprite.anims.isPlaying) return
      this.rangedPhase = 'walk'
      this.rangedTarget = null
    }
    // Allied units always outrank the player and bus when one is inside the
    // firing window. Distance is only used to choose between allies.
    const ally = allies.filter(reachable).sort((a, b) => b.sprite.x - a.sprite.x)[0] ?? null
    const target: EnemyTarget | null = ally ?? (reachable('player') ? 'player' : reachable('bus') ? 'bus' : null)
    if (target && canShootFromLeft(body, bounds(target), combatConfig.rangedRange - this.combatAdvance)) {
      this.sprite.setVelocityX(0)
      if (time >= this.nextAttackAt) {
        this.rangedTarget = target
        this.rangedPhase = 'charge'
        this.sprite.play(enemyActions.BlastCharge.key)
      } else this.sprite.play(enemyActions.Idle.key, true)
    } else {
      this.sprite.setVelocityX(-combatConfig.enemySpeed)
      this.sprite.play(enemyActions.Walk.key, true)
    }
  }
  takeDamage(amount: number): void {
    if (this.hp <= 0) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp === 0) {
      this.sprite.setVelocity(0).disableBody()
      this.bar.destroy()
      this.sprite.clearTint().play(enemyActions.Die.key)
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.sprite.destroy())
    } else {
      this.sprite.setTintFill(0xffffff)
      this.scene.time.delayedCall(90, () => { if (this.sprite.active) this.sprite.clearTint() })
    }
  }
}

export class Boss implements HostileTarget {
  readonly kind = 'boss' as const
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly bar: HealthBar
  hp = combatConfig.boss.health
  private readonly warning: Phaser.GameObjects.Ellipse
  private readonly patrolCenter: number
  private patrolDirection = -1
  private awakened = false
  private attackPhase: 'idle' | 'locking' | 'floating' = 'idle'
  private basicPhase: 'idle' | 'charge' | 'release' = 'idle'
  private basicTarget: BossBasicTarget | null = null
  private nextBasicAttackAt = 0
  private lifePhase: 'alive' | 'vanishing' | 'rain' | 'appearing' | 'defeated' = 'alive'
  private finalRainUsed = false
  private finalRainStarted = false
  private shouldStartFinalRain = false
  private volleyMultiplier = 1
  private lockCommittedToPlayer = false
  private lockStartedAt = 0
  private nextAttackAt = 0
  private releaseAt = 0
  private barrageX = 0
  private barrageY = 0

  constructor(private scene: Phaser.Scene, x: number, groundY: number) {
    this.patrolCenter = x
    this.sprite = scene.physics.add.sprite(x, groundY, enemyActions.PowerUp.frames[0])
      .setOrigin(0.5, 1).setScale(combatConfig.boss.scale).setFlipX(true)
      .setDepth(6).setCollideWorldBounds(true)
    this.sprite.setSize(24, 52).setOffset(36, 32)
    this.sprite.setData('enemy', this)
    this.bar = new HealthBar(scene, 140, this.hp, 'BOSS', 0xff405f)
    this.bar.setVisible(false)
    this.warning = scene.add.ellipse(0, 0, 82, 30, 0xff1f3d, 0.16)
      .setStrokeStyle(3, 0xff405f, 0.95).setDepth(8).setVisible(false)
    this.sprite.play(enemyActions.PowerUp.key)
  }

  get combatActive(): boolean { return this.lifePhase === 'alive' && this.hp > 0 }
  get defeated(): boolean { return this.lifePhase === 'defeated' }
  get visibleOnMap(): boolean {
    return this.lifePhase !== 'rain' && this.lifePhase !== 'defeated' && this.sprite.visible
  }
  get volleySize(): number { return combatConfig.boss.volleySize * this.volleyMultiplier }
  get arrowSpeedMultiplier(): number {
    return combatConfig.boss.arrowSpeedMultiplier * this.volleyMultiplier
  }
  get arrowFloatDistanceMultiplier(): number { return 1 + (this.volleyMultiplier - 1) * 0.5 }

  update(time: number, player: Bounds, bus: Bounds, allies: FriendlyTarget[],
    prepareVolley: (boss: Boss) => void,
    releaseVolley: (boss: Boss, target: Bounds) => void,
    launchBasicArrow: (boss: Boss, target: Bounds) => void,
    startFinalRain: (boss: Boss) => void): void {
    if (this.lifePhase === 'defeated' || this.lifePhase === 'rain') return
    if (this.lifePhase === 'vanishing') {
      if (this.shouldStartFinalRain && !this.finalRainStarted) {
        this.finalRainStarted = true
        startFinalRain(this)
      }
      if (!this.sprite.anims.isPlaying) {
        this.sprite.setVisible(false)
        if (this.shouldStartFinalRain) this.lifePhase = 'rain'
        else this.finishDefeat()
      }
      return
    }
    if (this.lifePhase === 'appearing') {
      if (!this.sprite.anims.isPlaying) {
        this.lifePhase = 'alive'
        this.sprite.play(enemyActions.PowerUp.key)
      }
      return
    }
    if (this.basicPhase !== 'idle') {
      this.sprite.setVelocityX(0)
      if (this.updateBasicAttack(time, launchBasicArrow)) return
    }
    const playerCenterX = (player.left + player.right) / 2
    if (!this.awakened && Math.abs(playerCenterX - this.sprite.x) <= combatConfig.boss.detectionRange) {
      this.awakened = true
    }
    if (this.awakened) {
      this.sprite.setVelocityX(-combatConfig.boss.moveSpeed)
    } else {
      if (this.sprite.x <= this.patrolCenter - combatConfig.boss.patrolRadius) this.patrolDirection = 1
      if (this.sprite.x >= this.patrolCenter + combatConfig.boss.patrolRadius) this.patrolDirection = -1
      this.sprite.setVelocityX(this.patrolDirection * combatConfig.boss.patrolSpeed)
    }
    this.sprite.play(enemyActions.PowerUp.key, true)

    if (this.attackPhase === 'idle' && time >= this.nextAttackAt) {
      const target = this.closestTarget(player, allies)
      if (target) {
        this.attackPhase = 'locking'
        this.lockStartedAt = time
        this.lockCommittedToPlayer = target === player
      }
    }
    if (this.attackPhase === 'locking') {
      const target = this.lockCommittedToPlayer ? player : this.closestTarget(player, allies)
      if (!target) {
        this.cancelLock(time)
      } else {
        if (target === player) this.lockCommittedToPlayer = true
        const x = (target.left + target.right) / 2
        const y = target.bottom - 3
        const pulse = 1 + Math.sin((time - this.lockStartedAt) * 0.012) * 0.1
        this.warning.setVisible(true).setPosition(x, y).setScale(pulse)
        if (time - this.lockStartedAt >= combatConfig.boss.lockDuration) {
          this.attackPhase = 'floating'
          this.volleyMultiplier = this.currentAttackMultiplier()
          this.barrageX = x
          this.barrageY = y
          this.releaseAt = time + combatConfig.boss.arrowFloatDuration
          this.warning.setPosition(x, y).setScale(1)
          prepareVolley(this)
        }
      }
    }
    if (this.attackPhase === 'floating' && time >= this.releaseAt) {
      releaseVolley(this, {
        left: this.barrageX - 2, right: this.barrageX + 2,
        top: this.barrageY - 2, bottom: this.barrageY + 2,
      })
      this.attackPhase = 'idle'
      this.nextAttackAt = time + combatConfig.boss.attackCooldown / this.currentAttackMultiplier()
      this.nextBasicAttackAt = Math.max(this.nextBasicAttackAt, time + 500)
      this.lockCommittedToPlayer = false
      this.warning.setVisible(false)
    }
    if (this.attackPhase !== 'idle') this.sprite.setVelocityX(0)
    if (this.attackPhase === 'idle' && time < this.nextAttackAt && time >= this.nextBasicAttackAt) {
      const target = this.findBasicTarget(player, bus, allies)
      if (target) {
        this.basicPhase = 'charge'
        this.basicTarget = target
        this.sprite.setVelocityX(0).play(enemyActions.BlastCharge.key)
      }
    }
  }

  private updateBasicAttack(time: number, launch: (boss: Boss, target: Bounds) => void): boolean {
    if (this.basicPhase === 'charge') {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      if (!this.basicTarget || !this.basicTarget.isAlive()
        || !canShootFromLeft(body, this.basicTarget.bounds)) {
        this.basicPhase = 'idle'
        this.basicTarget = null
        this.nextBasicAttackAt = time + 500
        this.sprite.play(enemyActions.PowerUp.key)
        return false
      }
      if (!this.sprite.anims.isPlaying) {
        launch(this, this.basicTarget.bounds)
        this.basicPhase = 'release'
        this.nextBasicAttackAt = time + combatConfig.rangedCooldown
        this.sprite.play(enemyActions.BlastAttack.key)
      }
      return true
    }
    if (this.basicPhase === 'release') {
      if (this.sprite.anims.isPlaying) return true
      this.basicPhase = 'idle'
      this.basicTarget = null
      this.sprite.play(enemyActions.PowerUp.key)
    }
    return false
  }

  private findBasicTarget(player: Bounds, bus: Bounds, allies: FriendlyTarget[]): BossBasicTarget | null {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const ally = allies
      .filter(target => target.hp > 0 && target.sprite.active
        && canShootFromLeft(body, target.sprite.body as Phaser.Physics.Arcade.Body))
      .sort((a, b) => b.sprite.x - a.sprite.x)[0]
    if (ally) return {
      bounds: ally.sprite.body as Phaser.Physics.Arcade.Body,
      isAlive: () => ally.hp > 0 && ally.sprite.active,
    }
    if (canShootFromLeft(body, player)) return { bounds: player, isAlive: () => true }
    if (canShootFromLeft(body, bus)) return { bounds: bus, isAlive: () => true }
    return null
  }

  private closestTarget(player: Bounds, allies: FriendlyTarget[]): Bounds | null {
    const bossX = this.sprite.x
    const bossY = this.sprite.y - this.sprite.displayHeight / 2
    const candidates: Bounds[] = [player, ...allies
      .filter(ally => ally.hp > 0 && ally.sprite.active)
      .map(ally => ally.sprite.body as Phaser.Physics.Arcade.Body)]
    return candidates
      .map(bounds => ({
        bounds,
        distance: Phaser.Math.Distance.Between(
          bossX, bossY,
          (bounds.left + bounds.right) / 2,
          (bounds.top + bounds.bottom) / 2,
        ),
      }))
      .filter(candidate => candidate.distance <= combatConfig.boss.attackRange)
      .sort((a, b) => a.distance - b.distance)[0]?.bounds ?? null
  }

  private cancelLock(time: number): void {
    this.attackPhase = 'idle'
    this.nextAttackAt = time + 500
    this.lockCommittedToPlayer = false
    this.warning.setVisible(false).setScale(1)
  }

  private currentAttackMultiplier(): number {
    const healthRatio = this.hp / combatConfig.boss.health
    if (healthRatio <= 0.25) return 3
    if (healthRatio <= 0.5) return 2
    return 1
  }

  takeDamage(amount: number): void {
    if (!this.combatActive) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp === 0) {
      this.shouldStartFinalRain = !this.finalRainUsed
      if (this.shouldStartFinalRain) this.finalRainUsed = true
      this.lifePhase = 'vanishing'
      this.finalRainStarted = false
      this.attackPhase = 'idle'
      this.lockCommittedToPlayer = false
      this.basicPhase = 'idle'
      this.basicTarget = null
      this.sprite.setVelocity(0).disableBody()
      this.warning.setVisible(false)
      this.bar.setVisible(false)
      this.sprite.clearTint().setVisible(true).play(enemyActions.Vanish.key)
    } else {
      this.sprite.setTintFill(0xffffff)
      this.scene.time.delayedCall(90, () => { if (this.sprite.active) this.sprite.clearTint() })
    }
  }

  absorbHealth(amount: number): void {
    if ((this.lifePhase !== 'vanishing' && this.lifePhase !== 'rain') || amount <= 0) return
    this.hp = Math.min(combatConfig.boss.health, this.hp + amount)
  }

  finishFinalRain(): void {
    if (this.lifePhase !== 'rain') return
    this.shouldStartFinalRain = false
    if (this.hp <= 0) {
      this.finishDefeat()
      return
    }
    this.lifePhase = 'appearing'
    this.sprite.enableBody(false, this.sprite.x, this.sprite.y, true, true)
      .setVelocity(0).setVisible(true).play(enemyActions.Appear.key)
  }

  private finishDefeat(): void {
    this.lifePhase = 'defeated'
    this.warning.destroy()
    this.bar.destroy()
    this.sprite.destroy()
  }

  stop(): void {
    if (this.sprite.active) this.sprite.setVelocity(0).stop()
    if (this.warning.active) this.warning.setVisible(false)
  }
}

const ALLY_TINT = 0x8f969f

export class AllyUnit implements FriendlyTarget {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly bar: HealthBar
  hp = combatConfig.enemyHealth
  private target: HostileTarget | null = null
  private hitAt = 0
  private finishAt = 0
  private nextAttackAt = 0
  private hitApplied = false
  private rangedPhase: 'walk' | 'aim' = 'walk'
  private rangedTarget: HostileTarget | null = null

  constructor(private scene: Phaser.Scene, x: number, groundY: number, readonly kind: EnemyKind = 'melee',
    readonly combatAdvance = Phaser.Math.FloatBetween(0, combatConfig.combatStagger.maxAdvance)) {
    this.sprite = scene.physics.add.sprite(x, groundY, avatarActions.Run.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setDepth(5).setTint(ALLY_TINT).setCollideWorldBounds(true)
    this.sprite.setSize(16, 38).setOffset(40, 46)
    this.sprite.setData('ally', this)
    this.bar = new HealthBar(scene, 48, this.hp, kind === 'melee' ? '友軍近戰' : '友軍遠攻', 0xaab2bd)
    this.sprite.play(avatarActions.Run.key)
  }

  update(time: number, enemies: HostileTarget[], launch: (ally: AllyUnit, target: Bounds) => void): void {
    if (this.hp <= 0) return
    if (this.kind === 'ranged') {
      this.updateRanged(time, enemies, launch)
      this.bar.update(this.sprite.x, this.sprite.y - 87, this.hp)
      return
    }
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const inRange = (enemy: HostileTarget) => enemy.hp > 0
      && canAttackFromRight(body, enemy.sprite.body as Phaser.Physics.Arcade.Body)
    if (this.target && !inRange(this.target)) this.target = null
    if (this.target) {
      this.sprite.setVelocityX(0)
      if (!this.hitApplied && time >= this.hitAt) {
        this.hitApplied = true
        if (inRange(this.target)) this.target.takeDamage(combatConfig.enemyDamage)
      }
      if (time >= this.finishAt) this.target = null
    } else {
      const target = enemies.filter(inRange).sort((a, b) => a.sprite.x - b.sprite.x)[0] ?? null
      if (target && canAttackFromRight(body, target.sprite.body as Phaser.Physics.Arcade.Body,
        combatConfig.attackRange - this.combatAdvance)) {
        this.sprite.setVelocityX(0)
        if (time >= this.nextAttackAt) {
          this.target = target
          this.hitAt = time + combatConfig.attackWindup
          this.finishAt = time + combatConfig.attackDuration
          this.nextAttackAt = time + combatConfig.attackCooldown
          this.hitApplied = false
          this.sprite.play(avatarActions.SwordComboA.key)
        } else this.sprite.play(avatarActions.Idle.key, true)
      } else {
        this.sprite.setVelocityX(combatConfig.enemySpeed)
        this.sprite.play(avatarActions.Run.key, true)
      }
    }
    this.bar.update(this.sprite.x, this.sprite.y - 87, this.hp)
  }

  private updateRanged(time: number, enemies: HostileTarget[],
    launch: (ally: AllyUnit, target: Bounds) => void): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const reachable = (enemy: HostileTarget) => enemy.hp > 0
      && canShootFromRight(body, enemy.sprite.body as Phaser.Physics.Arcade.Body)
    if (this.rangedPhase === 'aim') {
      if (!this.rangedTarget || !reachable(this.rangedTarget)) {
        this.rangedPhase = 'walk'
        this.rangedTarget = null
      } else if (!this.sprite.anims.isPlaying) {
        launch(this, this.rangedTarget.sprite.body as Phaser.Physics.Arcade.Body)
        this.rangedPhase = 'walk'
        this.rangedTarget = null
        this.nextAttackAt = time + combatConfig.rangedCooldown
        this.sprite.play(avatarActions.Idle.key)
        return
      } else return
    }
    const target = enemies.filter(reachable).sort((a, b) => a.sprite.x - b.sprite.x)[0] ?? null
    if (target && canShootFromRight(body, target.sprite.body as Phaser.Physics.Arcade.Body,
      combatConfig.rangedRange - this.combatAdvance)) {
      this.sprite.setVelocityX(0)
      if (time >= this.nextAttackAt) {
        this.rangedTarget = target
        this.rangedPhase = 'aim'
        this.sprite.play(avatarActions.BowAim.key)
      } else this.sprite.play(avatarActions.Idle.key, true)
    } else {
      this.sprite.setVelocityX(combatConfig.enemySpeed)
      this.sprite.play(avatarActions.Run.key, true)
    }
  }

  takeDamage(amount: number): void {
    if (this.hp <= 0) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp === 0) {
      this.sprite.setVelocity(0).disableBody()
      this.bar.destroy()
      this.sprite.setTint(ALLY_TINT).play(avatarActions.Die.key)
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.sprite.destroy())
    } else {
      this.sprite.setTintFill(0xffffff)
      this.scene.time.delayedCall(90, () => { if (this.sprite.active) this.sprite.setTint(ALLY_TINT) })
    }
  }

  stop(): void { if (this.hp > 0) this.sprite.setVelocity(0).stop() }
}
