# Prototype Asset Usage

Before adding or modifying asset loading, characters, backgrounds, actions, or animations in this project, read and follow `C:/Users/Garen/.codex/skills/phaser-prototype-assets/SKILL.md` (`$phaser-prototype-assets`).

- Find assets in this project's `public/assets/` first, using actual files and exact casing.
- Use `images/` for static images. Inspect the format of assets in `sprites/`, which may contain numbered image sequences, individual images, spritesheets, or atlases.
- Treat numbered images sharing a character, action directory, and filename prefix as one animation. Load and play the complete group in numeric order, for example `sprites/Avatar/Idle/Idle01.png` through `Idle07.png`. Do not substitute the first frame for the full action unless the user requests a static pose.
- Apply these rules to newly added assets too. Do not assume fixed frame counts or invent missing files.

If the personal skill path is unavailable in another environment, still follow the project rules above.

## Language

Write skills and technical instructions in English. Communicate with the user in Traditional Chinese.
