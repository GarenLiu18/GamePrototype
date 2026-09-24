---
name: phaser-prototype-assets
description: Use when adding or modifying scenes, characters, backgrounds, animations, or asset loading in the Phaser project at D:/PhaserProject/GamePrototype. Find existing assets in public/assets, distinguish static images, atlases, and numbered image sequences, and load and play each animation sequence as a complete group. Applies only to this project or work explicitly reusing its assets.
---

# Phaser Prototype Asset Rules

## Synchronization Rule

- This skill file exists in two parallel locations within the project workspace:
  - `.agents/skills/phaser-prototype-assets/SKILL.md` (for Antigravity / Gemini agents)
  - `.codex/skills/phaser-prototype-assets/SKILL.md` (for Codex agents)
- **Mandatory Synchronization**: Whenever any modification is made to either skill file, the exact same changes MUST immediately be applied to the other skill file to keep them strictly in sync.

## Asset sources

- Project root: `D:/PhaserProject/GamePrototype`. In a checkout of this project, resolve relative paths from that checkout's root.
- Find and reuse assets in `public/assets/` first. Treat files currently on disk as authoritative; this document is not a fixed asset inventory.
- `images/`: static images such as backgrounds and scene objects.
- `sprites/`: characters, enemies, actions, and effects. Contents may be individual images, numbered frame sequences, spritesheets, or atlases. Do not infer the format from the directory alone.
- `audio/` and `tilemaps/`: search these first when sound, music, or maps are needed.
- Preserve actual directory and filename casing. Current directories use lowercase `images` and `sprites`; character directories include `Avatar` and `Enemy`.
- Web URLs omit `public`: `public/assets/sprites/Avatar/Idle/Idle01.png` maps to `/assets/sprites/Avatar/Idle/Idle01.png`. For a non-root Vite base, combine `import.meta.env.BASE_URL` with `assets/...`.
- If suitable assets are missing, state what is missing. Do not invent filenames or silently substitute generated or downloaded assets.

## Discovery and grouping

1. Search for the requested character, action, or background, then list files in candidate directories. Filter `rg --files public/assets` results instead of printing the entire asset library.
2. Inspect candidate images when appearance, facing direction, or image layout matters. Do not infer visual content or frame dimensions from filenames alone.
3. Group images with the same directory, filename prefix, and trailing numeric index into one animation sequence. For example, `Avatar/Idle/Idle01.png` through `Idle07.png` form Avatar's Idle action.
4. Sort trailing indices numerically, avoiding lexical orders such as `1, 10, 2`. Preserve zero padding in actual filenames.
5. Include the full relative directory and filename prefix in grouping keys. Keep characters, directions, actions, and subdirectories separate. `Avatar/Idle` and `Enemy/Idle` are distinct animations; preserve nested action paths too.
6. Derive frame counts and ordering from actual files. Do not assume every animation has seven frames. Report missing or duplicate indices without constructing nonexistent URLs; if proceeding, retain the complete list of existing frames.

## Phaser loading and playback

- **Numbered image sequences**: load every image in the selected action with `this.load.image()` in `preload()`, assigning a distinct texture key to each frame. After loading, create one animation in `create()` with `this.anims.create()` and an ordered list of `{ key: textureKey }` entries, then play it with `sprite.play(animationKey)`.
- Expose action-level calls: selecting an action should load, register, and play its complete frame group without requiring callers to manage individual frames. Reuse or introduce small helpers or manifests only when implementation work requires them.
- Namespace texture and animation keys by character and relative action path, for example texture `sprites/Avatar/Idle/Idle01` and animation `anim/Avatar/Idle`. Avoid bare keys such as `Idle` that collide across characters.
- Reuse loaded textures and guard animation registration with `this.anims.exists(animationKey)` across scenes and scene restarts. Do not recreate or restart animations on every update; use `sprite.play(animationKey, true)` where appropriate.
- **Spritesheets**: use `this.load.spritesheet()` only after confirming a regular frame grid and determining slicing data such as frameWidth and frameHeight.
- **Atlases**: use `this.load.atlas()` only when both the image and matching atlas metadata exist, using frame names from that metadata.
- **Static images or single-frame poses**: display as an image or sprite. Allow a one-frame action when using an action interface; do not invent additional frames.
- Persistent states such as Idle, Walk, and Run usually loop; attacks, hit reactions, and death usually play once. Follow gameplay needs and existing settings rather than looping every animation.
- When timing information is unavailable, an adjustable 10 fps is a reasonable prototype starting point. Label it as an implementation assumption, not the asset's original timing.
- Unless the user requests a static preview or specific pose, do not use only `Idle01.png` to represent the full Idle animation. Load complete action groups needed for the current task rather than preloading the entire library.

## Completion checks

- Verify each asset URL corresponds to an existing file, with correct casing, numeric frame order, and action grouping.
- When modifying loading code, run the project's applicable type and build checks. When preview is available, verify assets do not return 404 and animations play all frames in order.
- Report selected asset paths, frame counts, and playback speed and loop settings. Do not claim a preview was verified unless it was actually run.

## Language

Write this skill and supporting technical instructions in English. Communicate with the user in Traditional Chinese.
