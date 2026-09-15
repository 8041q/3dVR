# 3DVR Editor — Quick User Guide

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

- **Scenes** — build the rooms/locations in the presentation.
- **Interactions** — place hotspots and decide how they look and what they do.
- **Guides** — build the visitor journey step by step.
- **Library** — upload/reuse panoramas, models, audio and video.
- **Project** — project name, create/switch/duplicate projects and project-level settings.

Only one tool opens at a time. Each tool also shows a short explanation at the top, so you can tell what it is for before changing anything.

Use **Hide** at the bottom of the rail when you want more space to inspect the panorama. Select any tool to open the panel again.

## 3. Draft vs published

Every project has two states:

- **Draft** — what you are currently editing.
- **Published** — what visitors see at `/v/project-name`.

The top of the editor can show:

- **Unsaved changes**
- **Draft saved — not published**
- **Published**

### Save

Use **Save** while working. Saving does not change the public presentation.

### Preview the draft

Use **Preview** to test the exact draft you currently have open, including unsaved changes.

Preview opens in a new tab and is clearly marked:

```text
Draft preview — Not published
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

- **Navigation** — general movement marker.
- **Floor** — wide oval, useful on the floor.
- **Doorway** — tall marker for doors/passages.
- **Window** — framed marker for windows/openings.
- **Product** — distinctive marker for inspectable products.
- **Information** — compact detail/information marker.

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

- **Use in scene** — use an image for the current scene.
- **Add to hotspot** — add a GLB product inspection to the selected hotspot.
- **Copy URL** — reuse the asset in narration or another field.

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

## Inspecting 3D products

When a hotspot uses **Inspect 3D model**, the product appears **inside the current panorama**. The room stays visible behind it so the visitor does not feel like they left the exhibition scene.

A light transparent backdrop can be used to separate the model from a busy panorama, but it should remain subtle.

### PC use

- **Drag the product** to rotate it horizontally/vertically.
- Use the **mouse wheel** to make it closer/larger or further/smaller.
- Select **View** for explicit Rotate left/right, Closer/Further, Reset and Recenter controls.
- **Recenter** moves the inspection in front of the visitor again without changing the scene.

### Phone use

Phone uses gaze rather than touch for the presentation controls. Point the center crosshair at an in-scene control and hold it there for a **2-second gaze** selection. The same rule applies when the phone is placed inside a plastic VR headset.

### VR headset with controllers

The product remains in the panorama as a world object. Point the controller ray at an in-scene control and select it.

Use the **View** controls when you want precise rotation/zoom without grabbing the model. The physical **Back** input also exits product inspection.

### VR headset without controllers / phone in a plastic headset

Every important product operation is available as an in-world button. Look directly at a button and keep the crosshair on it until the dwell selection completes.

This includes:

- Rotate left / right
- Closer / Further
- Reset view
- Recenter
- animations
- finishes
- details/annotations
- Back

Direct dragging is therefore optional; a visitor never needs a controller to complete an inspection.

### Product control tabs

The in-scene controls are grouped so they do not surround the product with dozens of buttons:

- **Motion** — animations plus pause/replay/speed.
- **Finishes** — material/texture finish presets and Original.
- **Details** — product annotations.
- **View** — rotate, zoom, reset, recenter and auto-rotation.

When there are many choices, use **Previous** / **Next** to move through pages.

### Movement / animations

For customer-facing presentations, rename technical GLB clip names in the editor. For example, use **Open storage** instead of `Bed_Storage_Open_v04`.

After an animation starts, the Motion controls allow pause/resume, replay and playback-speed changes. Slower playback is useful for showing mechanisms.

### Finishes

Choose a finish to apply it, or choose **Original** to restore the material stored in the GLB. Finish textures remain part of the published/offline project assets.

### Details / annotations

Annotations remain attached to their product point. When an annotation was visually placed on a named animated GLB node, it follows that part while it moves. This is useful for drawers, doors and adjustable mechanisms.

For the best result, give important moving objects meaningful names in the source 3D file before exporting the GLB.

### In-scene presentation settings

In **Interactions → Inspect 3D model → In-scene presentation**, you can set:

- distance from the visitor;
- closest and furthest product size;
- transparent backdrop strength;
- automatic rotation;
- exposure and environment-light strength;
- grounding-shadow strength;
- default animation speed.

Keep the backdrop fairly low so the original panorama remains part of the experience. Use **Draft Preview** to test the product on PC, then test the same published/draft experience in the actual headset before an exhibition.

### Compressed models and offline use

3DVR supports Meshopt, Draco and KTX2/Basis model assets. The Draco and Basis decoder files are self-hosted and included in the offline application shell, so downloaded exhibition projects do not need an external decoder service when Wi-Fi is unavailable.


## Tracked VR spatial rooms

A scene can now have two representations:

- the rendered panorama for desktop and phone;
- an actual Blender room GLB for a position-tracked WebXR headset.

When a tracked headset enters a scene that has a Blender room configured, 3DVR uses the room GLB instead of loading/rendering the panorama. This allows real leaning, crouching and small physical movement.

If the headset reports rotation-only / emulated positional tracking, the viewer falls back to the panorama.

### Phone input

Phone and phone-headset modes use the same input method:

1. look at an interactive target with the center crosshair;
2. keep the crosshair on it for **2 seconds**;
3. it activates like a click.

Touch is not required for hotspot selection. The phone-headset option changes the visual presentation for a plastic headset, not the selection method.


### If Phone mode does not rotate

Phone and phone-headset modes require browser orientation-sensor data. In Phone mode the top controls now report the actual state instead of only saying that motion is unavailable.

- **Motion active** — orientation data is arriving.
- **HTTPS required** — open the project through HTTPS. Mobile browsers may block orientation sensors on a normal LAN `http://` address.
- **Motion permission denied** — use **Enable motion** and accept the browser permission prompt.
- **Waiting for phone motion** — the browser has not delivered a usable orientation event yet.

Use **Recenter view** whenever you want the phone's current heading to become the center of the panorama. This is especially useful immediately after putting the phone into a plastic headset.

### Importing a Blender room

In **Scenes**, select the matching scene and find **Tracked VR room**.

Choose **Import Blender room** and select both files produced by the 3DVR Blender exporter:

```text
<scene>-room.glb
<scene>.3dvr.json
```

The importer attaches the tracked room and imports Blender-authored hotspot positions. New uploads keep a safe human-readable filename, and the project also retains the Blender manifest's expected room filename.

For server migration or backups, run:

```bash
npm run export:project -- <project-id> <destination>
```

This is important because runtime uploads and generated panorama data are intentionally outside normal Git tracking. Restore the bundle in another checkout with `npm run import:project -- <bundle-directory>`.


### Moving objects inside a tracked Blender room

For tracked VR, do not create a duplicate standalone GLB just to inspect furniture that is already part of the room. Animate the real Blender object and export that animation with the room.

In the web editor:

1. select/create the Blender-authored hotspot near the object;
2. open **Actions**;
3. add **Play room movement**;
4. choose the exported Blender animation clip;
5. choose whether selection toggles, restarts, or plays/resumes the clip.

The object remains at its real Blender position and physical size while it moves. The visitor can lean/crouch around the same object during and after the animation.

Because desktop/phone use a rendered panorama, the room movement itself is tracked-VR-only. If the hotspot also needs to be useful in panorama modes, add another action after it such as **Show information**, **Start guide**, or **Go to scene**.

For the complete Blender preparation/export walkthrough, read:

```text
docs/BLENDER_SPATIAL_SCENES.md
```

## Calibrating Phone and Phone Headset view

Open **Phone**, then choose **Calibrate view**. The calibration panel is intentionally translucent so the scene remains visible while you change values.

Changes are a live preview. **Save profile** stores the calibration on that phone. Closing the panel without saving restores the previously saved profile. **Reset defaults** returns the preview to the standard values.

### Magic Window

Use this for normal handheld phone viewing. Device motion controls where you look. You may also enable touch drag as a small manual correction. The 2-second center crosshair remains available for selecting hotspots.

### Headset Stereo

Use this before placing the phone into a plastic/cardboard-style headset. The scene is split into left and right eyes and the center crosshair is used for interaction.

Useful controls:

- **IPD / lens spacing** — separation between the virtual left and right eyes.
- **Focus distance** — stereo convergence distance.
- **Focus / convergence trim** — a digital comfort adjustment. This is not a real optical diopter control; physical diopter correction requires adjustable headset lenses.
- **Field of view** — virtual camera FOV.
- **Screen width** — physical phone display width used as a calibration reference.
- **Screen-to-lens distance** — physical spacing between display and headset lens; the panel shows an estimated optical FOV from this value.
- **Rendered screen size** — shrinks the stereo render symmetrically from both outside edges. This is useful when a headset does not expose the entire phone screen through its lenses.
- **Stereo split** — moves the left/right division.
- **Center gap** — leaves a blank strip between both eye images if the headset requires it.
- **Lens center offset** — moves both eye images toward or away from the optical lens centers.
- **Stereoscopic rendering** — disable this to duplicate the same mono camera into both halves for troubleshooting.

The left/right output is now centered mathematically around the screen. The renderer also uses the correct half-screen stereo projection rather than rendering a full-screen projection into two half-width viewports.

### Re-center / orientation reset

Hold the phone in the position that should be considered forward and choose **Re-center / orientation reset**. Do this again after mounting the phone if the headset changed the phone's angle.

### Dollhouse

Dollhouse appears only when the current scene has an imported Blender spatial room. It shows that room as a miniature phone preview. It is useful for checking room geometry and Blender-authored hotspots; it is not used by the normal panorama or tracked-VR presentation.

### Gaze timer

When the center crosshair rests on an interactive target, a circular progress ring grows around it. A full ring equals the 2-second dwell and triggers the selection. Looking away clears the ring immediately.
