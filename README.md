# Hull Designer

Browser-based hard-chine hull designer inspired by Carlson Hull Designer (`Hulls.exe`).

Model a chined hull (up to 10 chines, 8 frames), compute hydrostatics, develop construction panels, nest them on plywood sheets, and export DXF / plot points.

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Modes

- **Model** — edit frames/chines, 3D ruled hull, developability warnings
- **Hydro** — draft / heel / trim / CG, displacement, LWL, CB, CLA, GZ
- **Patterns** — panel unfold, multi-sheet nesting, DXF + hand-plot export

Designs save as `.hull.json`. Built-in samples are in the Samples menu; the Carlson `.HUL` library in `hulls/` is served at `/hulls/` and listed under **Library**. You can still **Open** a local `.hul` / `.hull.json` file.
