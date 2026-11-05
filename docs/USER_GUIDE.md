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

## 2. Edit a scene

Select a scene from the list on the left. The center shows its panorama and the inspector on the right shows its image, hotspots, and settings. Select a hotspot on the canvas or in the inspector to edit what it does. **Back to scene** returns to the scene inspector.

Use the workspace bar to switch between **Scenes**, **Guides**, **Assets**, and **Project**. The **Project** tab holds project metadata and settings; the project name menu also provides **Project details** and **Manage projects**. The header holds **Save draft**, **Preview**, **Review & publish**, **Undo**, and **Redo**.

Drag the panorama to look around and scroll to zoom. **Reset view** restores the default direction and zoom. Use **Hide inspector** when you need a wider canvas. While placing or moving a hotspot, drag to look around and click once to place it. **Esc** cancels placement.

Use **Ctrl+S** (or **Cmd+S**) to save, **Ctrl+Z** to undo, and **Ctrl+Shift+Z** to redo. Text fields retain their normal text undo behavior. Leaving the editor with unsaved edits triggers a browser reminder.

## 3. Draft vs published

Every project has two states:

- **Draft** — what you are currently editing.
- **Published** — what visitors see at `/v/project-name`.

The top of the editor can show:

- **Unsaved changes**
- **Draft saved**
- **Published**

### Save

Use **Save draft** while working. Saving does not change the public presentation.

### Test the draft

Choose **Preview** to try the current draft, including unsaved changes, from the starting scene. Use **Preview scene** above the canvas to start in the selected scene. **Restart** returns to the scene where the preview began.

Choose **Back to editing** to return to your scene, selection, and draft.

### Publish and share

Use **Review & publish** when the presentation is ready. The review checks required settings, local panorama sources, and local model files. Resolve the blockers and review any warnings about external media, disconnected scenes, or existing multi-action hotspots. Select an item to open its editor. Use **Publish & get link** to save the draft and update the public version.

After publishing, a compact share window appears with:

- the public URL and **Copy link**
- **Open viewer**
- a QR code and **Download QR**
- the Share button on browsers/devices that support it
- scene/Guide counts, start scene and revision information
- a reminder that the published copy stays live while you keep editing the Draft

The QR code is generated locally by 3DVR; it does not use an external QR website.

## 4. Create or duplicate a project

Open **Manage projects** from the project name menu or the **Project** tab. Enter a name and select **Create project**, or use **Duplicate current draft** to copy the current project, including unsaved edits and metadata. The copy has its own link and can be opened in a new tab.

In **Project**, describe the experience with a title, description, content language, and comma-separated keywords. Record the author, organization, contributors, license, and copyright or usage notes. All metadata is optional and follows the same **Save draft**, **Undo**, and **Review & publish** workflow as scene edits. Metadata is included in published manifests, offline copies, and project exports. Content language describes the project; it does not translate the interface.

The **Starting scene** setting chooses the visitor’s entry point. **Project information** shows the project ID, creation date, last saved date, publication date, and published revision. These values are maintained automatically.

## 5. Scenes

Select **Add scene** and give it a name in the inspector. Upload a 2:1 panorama or choose an existing image to give the scene a view.

Assign a group in the scene inspector. Use the options menu on a scene row to choose **Set as starting scene**, **Move up**, or **Move down**. You can also drag scene rows to reorder them. The scene search matches both names and groups.

### Scene map

Select **Scene map** to see the project as a navigation diagram.

- Each card is a scene.
- Lines are created automatically from **Go to scene** hotspot actions.
- The `Start` badge shows the public starting scene.
- Drag the small **Move** handle to organise the diagram.
- Select a scene card to jump back to that scene in the editor.
- **Auto arrange** resets the diagram to a clean grid.

Moving cards in the Scene map only changes the editor diagram; it does not change visitor navigation.

## 6. Add a normal 360 panorama

Select a scene and choose **Choose from assets** in its inspector. Upload an image in the asset picker or choose **Use image** on an existing asset. Choosing another asset replaces the scene’s panorama. Use a JPEG, PNG or WebP with a 2:1 equirectangular projection.

## 7. Add a large panorama or tracked VR room

In **Panorama source**, open **Process a large panorama** to upload a master image. If an upload stops, reselect the same file and choose **Resume upload**. **Stop watching** leaves the server processing. Return to the same scene to check the job and choose **Apply panorama** when the tiles are ready.

Open **Tracked VR room** in the same inspector to import a Blender room.

## 8. Place a hotspot

1. Select a scene with a panorama and choose **Add hotspot** in its inspector.
2. Choose what visitors should be able to do. For scene navigation, pick the destination scene.
3. Select **Place on panorama**, then click the position on the canvas.
4. Edit the hotspot name and configure its action in the inspector. Expand **Appearance** to adjust the marker.

To move an existing hotspot, select it and choose **Move hotspot**. **Center in view** turns the canvas toward the selected hotspot.

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

Choose **Edit product**, then follow the four steps. The step bar stays visible; use **Back** and **Continue** at the bottom to move through setup.

1. **Model** — upload a GLB or choose one from Assets. Animations and materials are detected automatically.
2. **Starting view** — drag to rotate, scroll or pinch to zoom, then choose **Save view & continue**. **Views** provides camera presets; **Fit model** shows the full object. Model orientation, visitor navigation, zoom limits, lighting and VR placement each have their own settings group.
3. **Interactions** — choose Animations, Finishes or Detail points. Each opens its own form with a preview button. Choose **Done with…** to return to the interaction list. These features are optional.
4. **Preview** — test the visitor experience in a full-size dialog. Close it to return to setup, then choose **Return to hotspot**. Use the editor’s **Save draft** to keep your changes.

On computers and phones, products open in a dedicated model view. Camera controls stay beneath the model, while animations, finishes and details have a separate panel with scrolling options. Shift-drag, right-drag or use two fingers to pan. Keyboard users can focus the model and use arrow keys to rotate, plus/minus to zoom, F to fit, and 0 to reset. VR retains gaze/controller controls in the scene.

## 11. Asset library

Open **Assets** to upload, browse, and preview reusable files.

- Drop multiple files onto the upload area or choose **Upload files**. The queue shows each result; **Retry failed** retries only failed uploads.
- Switch between **Grid** and **List**, search by name or format, and sort by date, name, or size.
- Filter by file type or choose **Used in this project** / **Not used in this project**. A file unused here may still be used in other projects or saved revisions.
- Select a file to preview an image, interactive 3D model, audio, or video. The preview lists where this project uses the file.
- **Use image** is available in a scene’s panorama picker; **Use model** is available in the product model picker.
- **More** includes **Copy link**, **Download**, and **Delete file**. Used files cannot be deleted until their references are removed.

## 12. Product animations

For a GLB with animations:

1. Choose **Edit product** on the hotspot's **Inspect product** action.
2. Choose the model, then open **Interactions → Animations**.
3. Clips are available automatically. Add a custom animation label to rename a clip, or turn off unlabelled clips to expose only selected animations.
4. Rename them to simple visitor-facing labels.

Example:

```text
Bed_Storage_Open_v04 -> Open storage
Headrest_Up_Final    -> Raise headrest
```

## 13. Finish presets

Use **Interactions → Finishes** in **Edit product** when one product has several fabrics, woods, metals or colours.

For each finish:

1. Select **Add finish**.
2. Give it a visitor-facing label such as `Walnut`, `Sand fabric` or `Brushed steel`.
3. Choose the GLB material that should change. Use `*` only when the whole model should receive the same finish.
4. Choose a tint colour.
5. Open **Texture and surface settings** to upload a texture or paste a texture URL from Assets.
6. In the same group, adjust roughness, metalness or how often the texture repeats when needed.

Useful examples:

- Fabric: texture + high roughness + metalness near 0.
- Polished metal: grey tint + lower roughness + high metalness.
- Wood: wood texture + roughness around the middle + metalness near 0.

The **Original** control in the product viewer restores the GLB's original material. Texture files referenced by finish presets are included in published/offline project asset discovery.

## 14. Product annotations

Annotations are detail points attached to an inspected 3D product.

The normal workflow is visual:

1. Choose **Edit product → Interactions → Detail points**.
2. Choose **Add detail point**. Rotate and zoom the model to reach the surface you need.
3. Tap or click the surface, then enter a point name and description in the same dialog.
4. Select **Save detail point**. Visitors can select its numbered marker or choose it under Details. Points attached to named parts follow their animations.

You can still open **Precise coordinates** when you need exact X/Y/Z values.

Good uses include hidden storage, mechanisms, material details, controls and construction details. Keep labels short and explanations clear.

## 15. Create a Guide

Open **Guides** and choose **New guide**. A first step is added automatically when scenes are available. Name the guide, then select a step in the left column.

Each step has three parts:

1. **Scene and message** — choose its scene, title, and the message visitors see.
2. **What visitors see** — drag the panorama and choose **Save starting view**. Select a hotspot in the panorama or under **Emphasize a hotspot** to make it stand out. **Start facing this hotspot** saves a starting view aimed directly at it.
3. **What happens next** — show the message and panorama, or automatically open a product/information hotspot. Choose whether visitors continue with **Next**, a hotspot selection, a delay, or whichever happens first. Product animations and finishes appear when a product is selected.

The left column contains only the ordered steps. Drag to reorder them or use **Move up / Move down**. Use **Duplicate step** for similar stops.

## 16. Test a guide

Choose **Play from this step** to test the selected step and continue through the rest of the guide. **Play guide** starts at the beginning. In the last step, continuing finishes the guide. Return to editing to adjust the draft before publishing.

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

Open the published viewer on the headset, open **Offline Mode**, and select **Save for offline**.

The offline copy includes the published project and its required assets, including multiresolution panorama tiles and referenced models/media.

Wait for **Ready offline**. Then turn Wi-Fi off, reopen the published viewer, and test the presentation on that device before the exhibition.

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

In **Hotspots → Open a 3D product → In-scene presentation**, you can set:

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
- **Motion permission denied** — allow motion sensors in the browser’s site settings, then select **Phone VR** again. There is no separate enable step.
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

1. Select the hotspot imported from Blender near the object.
2. Choose **Play a VR room animation** and select the exported clip.
3. Choose whether selection toggles, restarts, or resumes the clip.

The object remains at its real Blender position and physical size while it moves. The visitor can lean/crouch around the same object during and after the animation.

Use **Add panorama fallback** if the hotspot also needs a visitor action in panorama mode. The fallback runs only when the room action is unavailable.

For the complete Blender preparation/export walkthrough, read:

```text
docs/BLENDER_SPATIAL_SCENES.md
```

## Phone VR calibration and dedicated VR headsets

Use **Drag** for mouse or touch navigation, or **Phone VR** to look around by moving your phone. Selecting **Phone VR** asks for motion permission when required. Its display selector offers **Single view** for handheld viewing and **Split screen** for placing the phone in a plastic/cardboard viewer.

Choose **Calibrate phone** in either layout. Single view offers field of view, motion status, and recentering; Split screen adds optical fit controls. Adjustments preview live. **Save settings** keeps them on this phone. **Cancel**, changing layout, or changing mode restores the settings from before calibration. **Reset settings** keeps the layout; in Single view it resets only FOV and preserves optical settings.

**VR Headset** is a separate WebXR mode for dedicated headsets of any brand supported by the browser and runtime. The button stays visible with a status explanation when unavailable. Availability refreshes when devices change or you return to the page; a click is still required to enter VR, and entry can fail if the device/runtime is busy. **Exit VR** returns to Drag.

Dedicated headset tracking, per-eye projection, and rendering parameters come from WebXR automatically. Use the headset system for fit, physical lens/IPD adjustment, room/floor setup, and recentering; how much setup is automatic varies by device. Phone calibration does not apply to dedicated headsets. A hardware connection alone does not guarantee browser support; WebXR requires HTTPS (or localhost).

### Handheld

Choose **Phone VR** for handheld phone viewing. Device motion controls where you look, and touch drag allows a manual correction. The 2-second center crosshair selects hotspots. Choose **Drag** at any time to return to mouse or touch navigation.

### Phone split screen

Select **Phone VR → Split screen** before placing the phone into a plastic/cardboard-style headset. The scene is split into left and right eyes and the center crosshair is used for interaction.

Choose **Drag** to stop motion and return to a single view. Choose **Single view** to leave split-screen while keeping motion navigation. Both release fullscreen and landscape lock.

Start with lens spacing, field of view, and visible screen width. Open **Advanced phone viewer settings** for depth, rendering, and screen alignment.

- **Lens spacing (IPD)** — separation between the virtual left and right eyes.
- **Focus distance** — stereo convergence distance.
- **Eye alignment trim** — a digital adjustment to how the left and right views line up.
- **Field of view** — virtual camera FOV.
- **Screen width** — physical phone display width used as a calibration reference.
- **Screen-to-lens distance** — physical spacing between display and headset lens; the panel shows an estimated optical FOV from this value.
- **Visible screen width** — shrinks the stereo render symmetrically from both outside edges.
- **Left-eye share of screen** — moves the left/right division.
- **Gap between views** — leaves a blank strip between both eye images if the headset requires it.
- **Lens center offset** — moves both eye images toward or away from the optical lens centers.
- **Render separate views for each eye** — turn this off to show the same view in both halves for troubleshooting.

The left/right output is now centered mathematically around the screen. The renderer also uses the correct half-screen stereo projection rather than rendering a full-screen projection into two half-width viewports.

### Recenter

Hold the phone in the position that should be considered forward and choose **Recenter** beside the display selector. Do this again after mounting the phone if the headset changed the phone's angle.

### Gaze timer

When the center crosshair rests on an interactive target, a circular progress ring grows around it. A full ring equals the 2-second dwell and triggers the selection. Looking away clears the ring immediately.


## Viewer controls and overlay visibility

Viewer and editor dropdowns use the same styled menu. Use arrow keys, Home/End, type to find an option, Enter to select, and Escape to dismiss.

Tour controls slide out after five seconds of inactivity. Top controls leave toward the top; bottom controls leave toward the bottom. Move the mouse near either viewer edge to bring them back. On a phone, tap an empty area of the panorama to toggle the controls. Swiping, pinching, and selecting hotspots do not toggle them. Keyboard activity reveals the controls as well.

Open menus, calibration, information dialogs, and offline downloads keep the interface available while in use. New scenes and guide steps reveal the controls again. Reduced-motion preferences replace sliding with a short fade.

In immersive VR and phone-headset display, controls remain stable for gaze and controller selection; they do not time out or move away during targeting.

The tour’s top-left watermark shows the 3DVR logo, brand, and project title without a button background.
