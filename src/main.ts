import Phaser from 'phaser'
import './style.css'

class PrototypeScene extends Phaser.Scene {
  constructor() {
    super('prototype')
  }

  create(): void {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2 - 24, 'Phaser Prototype', {
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height / 2 + 34, '從 src/main.ts 開始驗證你的玩法', {
        color: '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
      })
      .setOrigin(0.5)
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 960,
  height: 540,
  backgroundColor: '#10131a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: PrototypeScene,
}

new Phaser.Game(config)
