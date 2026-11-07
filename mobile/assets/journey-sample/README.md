# Sample journey pictures and clips

What the My journey tab shows while a pilgrim has no posts of their own (see `src/lib/sampleJourney.ts` and
`src/features/me/SampleJourney.tsx`). **Everything here is AI-generated.** It is always labelled "Sample ... AI-generated"
in the app, listed on the Licences screen and on https://camino.plus/licences, and must never be presented as a
pilgrim's own photo or as a picture of one exact real place.

## How it was made (2026-11-07, OpenArt)

- **Pictures (10, `*.webp`, 768 x 1376):** Google Nano Banana 2 (`nano-banana-2`, text to image), 1K, aspect 9:16,
  20 credits each. Prompts were written as candid vertical smartphone photos ("UGC style"), with no people's faces,
  no readable text, no logos and no watermark. Converted from PNG to WebP, quality 80.
- **Clips (6, `*.mp4`, 720 x 1280, 6 s, 24 fps, silent):** Google Veo 3.1 image to video (`veo3-1`, mode `lite`, 720p,
  9:16, audio off), 120 credits each, using the matching picture as the first frame. Re-encoded with H.264, CRF 28,
  no audio track. The picture of the same name is the clip's poster.
- Total spend: 10 x 20 + 6 x 120 = 920 credits. Size in the app: about 7.8 MB.

| Key | Picture shows | Clip (motion asked for) |
|---|---|---|
| cobbled-street | Worn boots on a cobbled lane in a Basque Pyrenees town, yellow arrow on a wall | no |
| fog-hiker | Hiker seen from behind with a scallop shell on the pack, walking up a foggy mountain path | yes: walks on, fog drifts |
| fountain | Hand filling a metal bottle at an old stone fountain with a carved scallop shell | yes: water splashes |
| stone-bridge | Medieval stone arch bridge at golden hour, waymarker in front | no |
| passport-stamp | Hands stamping a pilgrim passport at a wooden desk | yes: stamp presses, blue mark appears |
| tired-feet | Feet on a bunk bed with a blister plaster, sandals on the floor | no |
| breakfast | Coffee and toast on a stone table, boots and stick behind | yes: steam rises, slow push-in |
| pilgrim-dinner | Communal albergue table, soup, bread, wine, hands toasting | no |
| wheat-arrow | Yellow arrow on a stone marker beside a path through wheat | yes: wheat ripples, camera moves on |
| ridge-cross | Stone wayside cross on a ridge at sunset, tiny hiker | yes: clouds drift |

## Rules

- Keep it small: a picture under 400 KB, a clip under 2 MB, the set under 10 MB (a test checks this).
- Every file here must be used by a sample in `sampleJourney.ts`, and every sample must have its files (a test checks this).
- Music: the clips are silent. If background music is added later, it must be music CaminoPlus has the right to
  ship inside an app, and it is credited on the Licences screen.
- Check the OpenArt plan's terms for commercial use of generated content before the public launch.
