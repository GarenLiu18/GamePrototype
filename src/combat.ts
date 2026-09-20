import Phaser from 'phaser'
import { enemyActions } from './assets'

export type EnemyKind = 'melee' | 'ranged'

export const combatConfig = {
  playerHealth: 100, busHealth: 300, enemyHealth: 60, bulletDamage: 20,
  enemyDamage: 10, busDamage: 20, enemySpeed: 65, attackRange: 58,
  attackWindup: 200, attackDuration: 600, attackCooldown: 1000,
  playerInvulnerability: 1200, playerBlinkInterval: 100,
  playerKnockbackSpeed: 260, playerKnockbackLift: 180,
  rangedRange: 520, rangedVerticalRange: 300, rangedCooldown: 2200,
  projectileGravity: 650, projectileLifetime: 3500,
  waveInterval: 15000,
  waveSpawns: {
    melee: [2100, 2170, 2240, 2310, 2380],
    ranged: [2450, 2520, 2590],
  } satisfies Record<EnemyKind, number[]>,
}

export type Bounds = { left: number; right: number; top: number; bottom: number }

export function canShootFromLeft(enemy: Bounds, target: Bounds): boolean {
  const dx = (enemy.left + enemy.right - target.left - target.right) / 2
  const dy = (enemy.top + enemy.bottom - target.top - target.bottom) / 2
  return dx >= 48 && dx <= combatConfig.rangedRange && Math.abs(dy) <= combatConfig.rangedVerticalRange
}

// Solve a ballistic arc to a snapshot of the target. No homing after release.
export function ballisticVelocity(x: number, y: number, targetX: number, targetY: number) {
  const flightTime = Phaser.Math.Clamp(Math.abs(targetX - x) / 380, 0.65, 1.15)
  return {
    x: (targetX - x) / flightTime,
    y: (targetY - y - 0.5 * combatConfig.projectileGravity * flightTime ** 2) / flightTime,
  }
}

// Enemies face left permanently. Only the forward horizontal strike band can hit.
export function canAttackFromLeft(enemy: Bounds, target: Bounds): boolean {
  return (target.left + target.right) / 2 <= (enemy.left + enemy.right) / 2
    && target.right >= enemy.left - combatConfig.attackRange
    && target.left <= enemy.left
    && target.bottom > enemy.bottom - 50
    && target.top < enemy.bottom - 16
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
  destroy(): void { this.background.destroy(); this.fill.destroy(); this.label.destroy() }
}

type Target = 'player' | 'bus'
export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly bar: HealthBar
  hp = combatConfig.enemyHealth
  private target: Target | null = null
  private hitAt = 0
  private finishAt = 0
  private nextAttackAt = 0
  private hitApplied = false
  private rangedPhase: 'walk' | 'charge' | 'release' = 'walk'
  private rangedTarget: Target | null = null
  constructor(private scene: Phaser.Scene, x: number, groundY: number, readonly kind: EnemyKind = 'melee') {
    this.sprite = scene.physics.add.sprite(x, groundY, enemyActions.Walk.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setFlipX(true).setDepth(5)
    this.sprite.setSize(18, 44).setOffset(39, 40)
    this.sprite.setData('enemy', this)
    this.bar = new HealthBar(scene, 48, this.hp, kind === 'melee' ? '近戰' : '遠攻', kind === 'melee' ? 0xf47b86 : 0xffc477)
    this.sprite.play(enemyActions.Walk.key)
  }
  update(time: number, player: Bounds, bus: Bounds, damage: (target: Target) => void,
    launch: (enemy: Enemy, target: Bounds) => void): void {
    if (this.hp <= 0) return
    if (this.kind === 'ranged') {
      this.updateRanged(time, player, bus, launch)
      this.bar.update(this.sprite.x, this.sprite.y - 87, this.hp)
      return
    }
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const inRange = (target: Target) => canAttackFromLeft(body, target === 'player' ? player : bus)
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
      const target = inRange('player') ? 'player' : inRange('bus') ? 'bus' : null
      if (target) {
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

  private updateRanged(time: number, player: Bounds, bus: Bounds,
    launch: (enemy: Enemy, target: Bounds) => void): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    const bounds = (target: Target) => target === 'player' ? player : bus
    const reachable = (target: Target) => canShootFromLeft(body, bounds(target))
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
    const target = reachable('player') ? 'player' : reachable('bus') ? 'bus' : null
    if (target) {
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
