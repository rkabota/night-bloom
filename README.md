# Night Bloom

A five-minute, hands-first wind-down ritual for Meta Quest. Built for the Meta VR Start Developer Competition 2026 (Productivity track, New Experience division).

1. **Arrive**: pinch the moon to begin (teaches the one gesture).
2. **Unload**: pinch what's on your mind into a jar.
3. **Breathe**: three slow breaths (4s in, 4s hold, 6s out); the flower opens as your palms open.
4. **Plant**: pinch one intention for tomorrow into the pot.
5. **Bloom**: tonight's flower opens; each night in a row adds a petal, past nights form a garden, and new colors unlock at 1, 3, 7, 14 and 30 nights.

Hands only (pinch, or touch and hold 1.5 s). Controllers optional. Seated, within about 2 feet. In passthrough the pot snaps to a detected table.

## Run it

No install and no build step. three.js 0.170.0 loads from a CDN via the import map in `index.html`.

```
npm start      # serves http://localhost:8080
npm test       # unit tests for gestures, ritual, garden and the dev server
```

- **Desktop preview**: open http://localhost:8080 and click "Preview in browser"; click the moon and chips. The breath runs on its own.
- **Desktop with simulated hands**: install the Immersive Web Emulator extension, pick a Quest 3 device, then enter.
- **On a Quest over USB**: `adb reverse tcp:8080 tcp:8080`, then open http://localhost:8080 in the Quest Browser.
- **Demo garden for filming**: add `?demo=7` to the URL. Demo nights live in memory and never overwrite real data.

## Publish (for judges)

WebXR needs https. Push this folder to a GitHub repo and turn on GitHub Pages (Settings > Pages > Deploy from branch, root), or drop the folder on any static https host. Put that link in the Devpost entry and test it on a Quest from outside your network.

## Files

| File | Purpose |
| --- | --- |
| `src/main.js` | Scene, hand tracking, picking, placement, step flow, sessions |
| `src/ritual.js` | Ritual state machine and breath pacing |
| `src/garden.js` | Streak, petals, palettes, garden layout, local saving |
| `src/gestures.js` | Pinch with hysteresis, palm-up, hand openness |
| `src/flower.js` | Procedural flower and pot |
| `src/ui.js` | Canvas-drawn text panels and chip layout |
| `src/audio.js` | Generated drone and chimes (Web Audio) |
| `tools/serve.js` | Zero-dependency local server |

## Known gaps to close before submitting

- Not yet run on a physical Quest: tune pinch thresholds, palm-up angle and openness range on device.
- Check 72 fps with a 30-night garden (`?demo=30`); swap mini flowers to InstancedMesh if needed.
- Table snapping uses the nearest horizontal plane's height only; check in two rooms.
