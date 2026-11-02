# Interactive Closet

Web viewer for Maya clothing: mouse-reactive fabric now, your exported closet next.

p5.js is the wrong first step. It can sketch 3D, but it does not handle Maya assets, glTF, lighting, or cloth well. Three.js is the usual path from DCC tools to the browser.

## What to do in Maya

1. Keep garments as **meshes**, not live nCloth. The browser cannot run Maya’s cloth solver. Convert nCloth to a mesh (`Edit nCloth > Convert nCloth to Polygons`, or export a posed mesh).
2. **Freeze transforms**, delete history, combine only if you still need separate pieces to click later.
3. Unwrap **UVs** and assign PBR textures (base color, roughness, normal).
4. Target a web-friendly polycount: one garment around **5k–40k triangles** is a good start.
5. Export **OBJ** from Maya (`File > Export All` / `Export Selection`, type OBJ).
   - Keep **materials** on so Maya also writes `closet.mtl` and texture files.
   - Copy **all** of those files together, not just the `.obj`.
6. Save them as `public/models/closet.obj` (and the matching `.mtl` / images) and refresh the site.

Maya `.ma` / `.mb` files cannot load in the browser. Always export. OBJ is fine for this stage; glTF (`.glb`) is still a better later format for PBR.

## Run the site

```bash
npm install
npm run dev
```

Until `closet.obj` (or `closet.glb`) exists, a hanging cloth prototype reacts to the mouse so you can judge the interaction.

## After the model loads

Next steps, in order:

1. Click / drag individual garments (raycast + object picking).
2. Per-piece mouse “push” on the mesh (vertex displacement), then a light cloth sim if it still looks cheap.
3. Product UI: name, price, add to cart around the 3D view.
