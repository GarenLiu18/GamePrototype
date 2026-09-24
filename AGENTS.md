# Prototype Asset Usage

Before adding or modifying asset loading, characters, backgrounds, actions, or animations in this project, read and follow `.agents/skills/phaser-prototype-assets/SKILL.md` (or `.codex/skills/phaser-prototype-assets/SKILL.md`).

- Find assets in this project's `public/assets/` first, using actual files and exact casing.
- Use `images/` for static images. Inspect the format of assets in `sprites/`, which may contain numbered image sequences, individual images, spritesheets, or atlases.
- Treat numbered images sharing a character, action directory, and filename prefix as one animation. Load and play the complete group in numeric order, for example `sprites/Avatar/Idle/Idle01.png` through `Idle07.png`. Do not substitute the first frame for the full action unless the user requests a static pose.
- Apply these rules to newly added assets too. Do not assume fixed frame counts or invent missing files.

## Skill Synchronization Rule

This project maintains two identical skill files for different agent environments:
- `.agents/skills/phaser-prototype-assets/SKILL.md` (for Antigravity / Gemini)
- `.codex/skills/phaser-prototype-assets/SKILL.md` (for Codex)

Whenever either skill file is modified, the other file MUST be updated simultaneously to maintain identical content across both.

## Language

Write skills and technical instructions in English. Communicate with the user in Traditional Chinese.
