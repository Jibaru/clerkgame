# Asset credits

## Models

- **models/clerk_van.glb**: "Clerk Van" by Jibaru (https://github.com/Jibaru/clerk-van), built on
  "Ford Transit With Light Bar" by circlegent (Sketchfab), licensed CC BY 4.0. Livery: Clerk brand
  assets. Compressed with gltf-transform (meshopt + WebP).
- **models/kits/**: low-poly models from Kenney (https://kenney.nl), CC0 1.0. Only the files the
  track uses are shipped.
- **models/real/**: photoscanned plants and rocks from Poly Haven (https://polyhaven.com), CC0:
  fern_02, grass_medium_02, dandelion_01, flower_heliophila, rock_07, rock_09, stone_01,
  boulder_01, namaqualand_boulder_02/04/06, dead_tree_trunk, fir_sapling. Decimated with
  gltf-transform `simplify` and compressed with meshopt + WebP.
- **Trees**: generated at runtime with ez-tree by Dan Greenheck (MIT).

## Textures

- **textures/alps_field/alps_field_2k.hdr**: "Alps Field" HDRI by Poly Haven
  (https://polyhaven.com/a/alps_field), CC0. Sky, image-based lighting and fog colour.
- **textures/asphalt_02/**: "Asphalt 02" by Poly Haven (https://polyhaven.com/a/asphalt_02), CC0.
- **textures/Grass005/**, **Ground037/**, **Rock051/**, **Gravel023/**: ambientCG
  (https://ambientcg.com), CC0. Downscaled to 512 px.

## Icons (collectibles and bots, extruded in 3D at runtime)

From game-icons.net, licensed CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/):

- **icons/cookie.svg**: "Cookie" by Delapouite (https://game-icons.net/1x1/delapouite/cookie.html)
- **icons/key-lock.svg**: "Key lock" by Delapouite (https://game-icons.net/1x1/delapouite/key-lock.html)
- **icons/finger-print.svg**: "Finger print" by Delapouite (https://game-icons.net/1x1/delapouite/finger-print.html)
- **icons/focused-lightning.svg**: "Focused lightning" by Lorc (https://game-icons.net/1x1/lorc/focused-lightning.html)
- **icons/robot-antennas.svg**: "Robot antennas" by Delapouite (https://game-icons.net/1x1/delapouite/robot-antennas.html)

## Music

- **audio/title.mp3**, **audio/race.mp3**, **audio/ending.mp3**: "Title Screen", "Level 1" and
  "Ending" from "5 Action Chiptunes" by Juhani Junkala (https://opengameart.org/content/5-chiptunes-action),
  CC0. Re-encoded from WAV to MP3.
- Sound effects (engine, tyres, pickups, hits, countdown, fanfare) are synthesized at runtime
  with the Web Audio API; no third-party samples.
