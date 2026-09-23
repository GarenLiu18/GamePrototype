import Phaser from 'phaser'
import { unitProgressionConfig as config } from './unit-progression.config'

export interface KillCredit {
  recordKill(): void
}

interface ProgressionOwner {
  hp: number
  readonly sprite: Phaser.Physics.Arcade.Sprite
}

export class UnitProgression implements KillCredit {
  private currentLevel = 0
  private killsSinceLevelUp = 0
  private readonly baseScale: number
  private star?: Phaser.GameObjects.Star

  constructor(private scene: Phaser.Scene, private owner: ProgressionOwner, private baseHealth: number) {
    this.baseScale = owner.sprite.scaleX
    if (!config.enabled) return
    owner.sprite.once(Phaser.GameObjects.Events.DESTROY, this.destroy, this)
  }

  get level(): number { return this.currentLevel }
  get kills(): number { return this.killsSinceLevelUp }
  get killsRequired(): number {
    return this.currentLevel >= config.maxLevel ? 0
      : config.firstLevelKillRequirement + this.currentLevel * config.additionalKillsPerLevel
  }
  get maxHealth(): number {
    return Math.round(this.baseHealth * (1 + (config.enabled ? this.currentLevel : 0) * config.healthIncreasePerLevel))
  }
  scaleDamage(baseDamage: number): number {
    return Math.round(baseDamage * (1 + (config.enabled ? this.currentLevel : 0) * config.attackIncreasePerLevel))
  }
  get sizeMultiplier(): number { return this.owner.sprite.scaleX / this.baseScale }
  get healthBarY(): number { return this.owner.sprite.y - 87 * this.sizeMultiplier }

  recordKill(): void {
    // A projectile may land after its shooter died. Never heal or revive it.
    if (!config.enabled || this.owner.hp <= 0 || !this.owner.sprite.active
      || this.currentLevel >= config.maxLevel) return
    this.killsSinceLevelUp += 1
    if (this.killsSinceLevelUp < this.killsRequired) return
    this.killsSinceLevelUp -= this.killsRequired
    this.currentLevel += 1
    this.owner.hp = this.maxHealth
    this.owner.sprite.setScale(this.baseScale * (1 + this.currentLevel * config.sizeIncreasePerLevel))
    // Level 0 has no badge. Create the procedural star on the first level-up.
    this.star ??= this.scene.add.star(0, 0, 5, 4.5, 10, config.starColors[0])
      .setStrokeStyle(2, 0x09111e).setDepth(22)
    this.star.setFillStyle(config.starColors[this.currentLevel - 1])
    this.update()
  }

  update(): void {
    this.star?.setPosition(this.owner.sprite.x, this.healthBarY - 36)
  }

  destroy(): void {
    this.star?.destroy()
    this.star = undefined
  }
}
