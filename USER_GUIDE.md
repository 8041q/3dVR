# 3DVR Editor - Quick User Guide

This guide is for the person building and publishing a presentation. It focuses on the normal workflow, not server internals.

## 1. Start the editor

For normal local work:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/editor/default
```

Use your editor password when asked. In development the default is `admin` unless `EDITOR_PASSWORD` was changed.

## 2. Use the Tool rail

The left side of the editor has a compact **Tool rail**. It is grouped by the job you are doing:

- **Scenes** - build the rooms/locations in the presentation.
- **Interactions** - place hotspots and decide how they look and what they do.
- **Guides** - build the visitor journey step by step.
- **Library** - upload/reuse panoramas, models, audio and video.
- **Project** - project name, create/switch/duplicate projects and project-level settings.

Only one tool opens at a time. Each tool also shows a short explanation at the top, so you can tell what it is for before changing anything.

Use **Hide** at the bottom of the rail when you want more space to inspect the panorama. Select any tool to open the panel again.

## 3. Draft vs published

Every project has two states:

- **Draft** - what you are currently editing.
- **Published** - what visitors see at `/v/project-name`.

The top of the editor can show:

- **Unsaved changes**
- **Draft saved - not published**
- **Published**

### Save

Use **Save** while working. Saving does not change the public presentation.

### Preview the draft

Use **Preview** to test the exact draft you currently have open, including unsaved changes.

Preview opens in a new tab and is clearly marked:

```text
Draft preview - Not published
```

This is for testing, not for sending to customers. It does not replace the published version.

### Publish and share

Use **Publish** when the presentation is ready. Publishing saves the draft first and updates the public version.

After publishing, a compact share window appears with:

- the public URL and **Copy link**
- **Open viewer**
- a QR code and **Download QR**
- the Share button on browsers/devices that support it
- scene/Guide counts, start scene and revision information
- a reminder that the published copy stays live while you keep editing the Draft

The QR code is generated locally by 3DVR; it does not use an external QR website.

## 4. Create or duplicate a project

Open **Project**.

To create a new project:

1. Enter a project name.
2. Select **Create**.
3. The new project opens automatically.

To reuse an existing presentation:

1. Open the project you want to copy.
2. Select **Duplicate current project**.
3. Edit the copy.

A new/duplicated project is not public until you publish it.

## 5. Scenes

Open **Scenes**. A scene is one 360-degree location.

To add one:

1. Enter a scene name.
2. Select **Add**.
3. Select the new scene.
4. Add its panorama.

Use **Group / area** when a project starts getting large. Good examples are `Ground floor`, `Bedrooms`, `Pavilion A` or `Outdoor`. The scene filters at the top then let you focus on one area.

You can drag scene cards up or down to change the editor order. This does not change which scene is the starting scene. Use **Set as start scene** for the scene visitors should see first.

### Scene map

Select **Open map** to see the project as a navigation diagram.

- Each card is a scene.
- Lines are created automatically from **Go to scene** hotspot actions.
- The `Start` badge shows the public starting scene.
- Drag the small **Move** handle to organise the diagram.
- Select a scene card to jump back to that scene in the editor.
- **Auto arrange** resets the diagram to a clean grid.

Moving cards in the Scene map only changes the editor diagram; it does not change visitor navigation.

## 6. Add a normal 360 panorama

Open **Library**.

For a normal-sized panorama:

1. Select **Upload asset** in the asset library.
2. Upload a JPEG, PNG or WebP.
3. Find it in the asset library.
4. Select **Use in scene**.

The image should be a proper 2:1 equirectangular 360 render.

## 7. Add a very large / maximum-quality panorama

Open **Library** and use **High-resolution panorama** (the Master panorama upload workflow).

1. Choose the original 2:1 equirectangular render.
2. Select **Upload master**.
3. Wait for upload and processing.
4. Select **Use in current scene**.

Large masters are converted into multiresolution tiles so the headset does not need the complete full-resolution render in GPU memory at once.

## 8. Place a hotspot

Open **Interactions**.

1. Select **Add hotspot**.
2. Click the desired position in the panorama.
3. Select the new hotspot in the list.
4. Give it a useful label.
5. Choose its appearance and actions.

You can also select an existing hotspot directly in the panorama while editing.

## 9. Hotspot appearance

Hotspot appearance does not change what the hotspot does.

Available styles are:

- **Navigation** - general movement marker.
- **Floor** - wide oval, useful on the floor.
- **Doorway** - tall marker for doors/passages.
- **Window** - framed marker for windows/openings.
- **Product** - distinctive marker for inspectable products.
- **Information** - compact detail/information marker.

You can also change marker colour, opacity and size.

### Hotspots used by Guides

You can safely change the appearance of a hotspot that is already used by a Guide.

Guides identify the hotspot by its internal ID, not by its shape. When a Guide wants the visitor to select that hotspot, 3DVR adds a flashing halo around the chosen style.

## 10. Hotspot actions

A hotspot can have one or more actions. The **Actions** tab now shows an **Action sequence** instead of one long form.

1. Select **Add action**.
2. Choose what should happen.
3. Select an action card to edit it.
4. Use **Earlier** / **Later** when several actions should run in a specific order.

The visitor runs the sequence from top to bottom when the hotspot is selected.

### Go to scene

Choose another scene to enter. These connections also appear automatically in the **Scene map**.

### Show information

Use for descriptions, instructions or product information.

### Open link

Use for an external website/page.

### Start guide

Starts one of the project's guided tours.

### Inspect product

Use when a product should open as an interactive GLB model.

## 11. Asset library

Open **Library** to see reusable files already stored on the server.

You can filter by:

- Image
- Model
- Audio
- Video

Useful actions include:

- **Use in scene** - use an image for the current scene.
- **Add to hotspot** - add a GLB product inspection to the selected hotspot.
- **Copy URL** - reuse the asset in narration or another field.

## 12. Product animations

For a GLB with animations:

1. Open its **Inspect 3D model** action.
2. Select **Scan model**.
3. Add the animation clips visitors should control.
4. Rename them to simple visitor-facing labels.

Example:

```text
Bed_Storage_Open_v04 -> Open storage
Headrest_Up_Final    -> Raise headrest
```

## 13. Finish presets

Use **Finish presets** when one product has several fabrics, woods, metals or colours. A finish can now change more than just colour.

For each finish:

1. Select **Add finish**.
2. Give it a visitor-facing label such as `Walnut`, `Sand fabric` or `Brushed steel`.
3. Choose the GLB material that should change. Use `*` only when the whole model should receive the same finish.
4. Choose a tint colour.
5. Optionally **Upload texture** or paste a texture URL from the Library.
6. Open **Surface settings** when you need to adjust roughness, metalness or how often the texture repeats.

Useful examples:

- Fabric: texture + high roughness + metalness near 0.
- Polished metal: grey tint + lower roughness + high metalness.
- Wood: wood texture + roughness around the middle + metalness near 0.

The **Original** control in the product viewer restores the GLB's original material. Texture files referenced by finish presets are included in published/offline project asset discovery.

## 14. Product annotations

Annotations are detail points attached to an inspected 3D product.

The normal workflow is visual:

1. Open the product's **Inspect 3D model** action.
2. Add an annotation and give it a short label/details.
3. Select **Place visually**.
4. Drag the model to rotate it.
5. Click the exact point on the model.
6. Select **Use this point**.

You can still open **Precise coordinates** when you need exact X/Y/Z values.

Good uses include hidden storage, mechanisms, material details, controls and construction details. Keep labels short and explanations clear.

## 15. Create a Guide

Open **Guides**.

The top of the Guide editor is a **Storyboard**. Each card is one visitor step. Select a card to edit only that step, or drag cards to reorder them. This keeps long Guides manageable.

Use **Earlier/Later** if you prefer buttons instead of dragging. You can also duplicate a step when the next one is similar.

A Guide is a sequence of steps. Steps can:

- move to a scene
- point toward something
- flash/highlight a hotspot
- wait for that hotspot to be selected
- open a product inspection
- play a product animation
- switch a material variant
- play narration

A simple exhibition Guide is usually better than a long one. Aim for one clear visitor instruction per step.

## 16. Narration

A Guide step can use MP3/WAV/OGG narration.

Upload the file through the asset tools and assign it to the step. The viewer also includes a manual **Narration** control because some browsers/headsets block automatic playback.

## 17. Recommended testing order

Before publishing:

1. Use **Preview** from the editor.
2. Check every scene and hotspot.
3. Run every Guide from start to finish.
4. Test product models/animations.
5. Test VR gaze/controller interaction.
6. Publish.
7. Scan the new QR code or open the published URL for one final public-viewer test.

## 18. Download a project to the headset

Open the published viewer on the headset and select **Download project**.

The offline copy includes the published project and its required assets, including multiresolution panorama tiles and referenced models/media.

After download, turn Wi-Fi off and test the presentation once before the exhibition.

## 19. Production server

For a simple production installation:

```bash
npm install
npm run build
npm start
```

You do not need two open terminals. `npm start` supervises the web/API process and panorama worker.

For Docker:

```bash
docker compose up -d --build
```

Use HTTPS for the production address, especially for WebXR/headset use.

## Recommended exhibition workflow

```text
Duplicate last project
-> edit draft
-> Preview
-> test on PC
-> test in headset
-> Publish
-> share/scan the QR code
-> download published project to headset
-> turn Wi-Fi off and test again
```
