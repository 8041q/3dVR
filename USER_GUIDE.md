# 3DVR Editor - Quick User Guide

This guide is for the person creating and publishing VR presentations. It avoids server and programming details unless they are needed for normal use.

## 1. Start the editor

For normal development/testing:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/editor/default
```

Use the editor password when asked. In development the default is `admin` unless you changed `EDITOR_PASSWORD`.

## 2. Projects: draft vs published

Every project now has two states:

- **Draft** - what you are currently editing.
- **Published** - what visitors see at `/v/project-name`.

The editor shows one of these states at the top:

- **Unsaved changes** - save the draft.
- **Draft saved - not published** - saved safely, but visitors still see the previous published version.
- **Published** - draft and public viewer are the same version.

### Save draft

Use **Save draft** while working. This does not change the public viewer.

### Publish

Use **Publish** when the project is ready. Publish automatically saves your current draft first.

Use **Open viewer** to check the exact version visitors will see.

## 3. Create or duplicate a project

Open **Projects** near the top of the editor.

To create a clean project:

1. Enter a project name.
2. Select **Create**.
3. The editor opens the new project automatically.

To use an existing project as a starting point:

1. Open the project you want to copy.
2. Open **Projects**.
3. Select **Duplicate current project**.
4. Edit the copy without affecting the original.

A new or duplicated project is not public until you press **Publish**.

## 4. Scenes

A scene is one 360-degree location.

To create a scene:

1. Enter a name under **Scenes**.
2. Select **Add**.
3. Open the new scene.
4. Replace its panorama with your own image.

Use **Set as start scene** on the scene visitors should see first.

## 5. Add a normal 360 panorama

If the image is small enough for a normal browser texture:

1. Open **Asset library**.
2. Select **Upload asset**.
3. Upload a JPEG, PNG or WebP.
4. Find the image in the library.
5. Select **Use in scene**.

The image should be a proper 2:1 equirectangular 360 render for correct viewing.

## 6. Add a very large / maximum-quality panorama

For large company renders, use **Master panorama upload** at the bottom of the screen instead of the normal image upload.

1. Open **Master panorama upload**.
2. Choose the original 2:1 equirectangular render.
3. Select **Upload master**.
4. Wait for processing to complete.
5. Select **Use in current scene**.

The server converts the master into multiresolution tiles. The headset then loads only the resolution it actually needs instead of trying to load the entire master image into GPU memory.

## 7. Place a hotspot

1. Open the scene.
2. Select **Place hotspot**.
3. Click the exact position in the panorama.
4. Give the hotspot a useful label.
5. Adjust its size if needed.

A hotspot can have more than one action.

## 8. Hotspot actions

Open a hotspot and use **Add action**.

### Navigate to scene

Use this for moving between rooms/locations.

1. Choose **Navigate to scene**.
2. Choose the destination scene.

### Show information

Use this for product descriptions, instructions or exhibition information.

1. Choose **Show information**.
2. Add a title and text.

### Open a link

Use this when a visitor should open an external page.

### Start guide

Use this to launch one of your guided tours from inside the VR scene.

### Inspect 3D model

Use this for a product that visitors should inspect more closely.

1. Choose **Inspect 3D model**.
2. Upload/select a GLB model.
3. Give it a clear visitor-facing title.
4. Use **Scan model** to find its animations and materials.

## 9. Asset library

The **Asset library** lists reusable files already on the server.

You can filter by:

- Image
- Model
- Audio
- Video

Useful actions:

- **Use in scene** - sets an image as the current panorama.
- **Add to hotspot** - creates a 3D inspection action using that GLB on the selected hotspot.
- **Copy URL** - useful when another editor field asks for an asset URL.

Select a hotspot first before using **Add to hotspot**.

## 10. Product animations

For a GLB with animations:

1. Open its **Inspect 3D model** action.
2. Select **Scan model**.
3. Add the animation clips you want visitors to control.
4. Rename them to friendly labels.

Example:

```text
Bed_Storage_Open_v04  ->  Open storage
Headrest_Up_Final     ->  Raise headrest
```

Visitors only see the friendly label.

## 11. Material variants

Use variants when one product has different finishes or colours.

For each variant:

1. Add a variant.
2. Give it a clear label such as `Walnut`, `Sand` or `Dark grey`.
3. Choose the model material to change.
4. Choose the colour.

More advanced texture replacement can be added later; the current variants are colour/material based.

## 12. Product annotations

Annotations are detail points attached to a 3D product.

Use them for things such as:

- hidden storage
- mechanisms
- material details
- USB ports
- controls
- construction details

Give each annotation a short label and explanation.

## 13. Create a guide

Open **Guides** in the editor.

A guide is a sequence of steps. A step can:

- move to a scene
- point the visitor toward something
- highlight a hotspot
- wait for a hotspot to be selected
- open a product inspection
- play a model animation
- change a material variant
- play narration

Keep exhibition guides short and clear. One instruction per step usually works best.

## 14. Narration

A guide step can use an audio file.

1. Upload the MP3/WAV/OGG through the asset upload tools.
2. Add its URL to the guide step narration field.
3. Test both online and after downloading the project offline.

The viewer also shows a **Narration** control because browsers/headsets can block automatic audio playback.

## 15. Test before publishing

Before pressing Publish, check:

1. Every scene opens.
2. Every navigation hotspot goes to the right place.
3. Information text is readable.
4. Models load.
5. Product animation buttons do what their labels say.
6. The guide can be completed without getting stuck.
7. VR gaze/controller controls can reach all required actions.

Then press **Publish** and use **Open viewer** for one final check.

## 16. Download a project to the headset

Open the published viewer on the headset and use **Download project**.

The offline copy includes the published project and its required assets, including multiresolution panorama tiles and referenced models/media.

After download, test once with Wi-Fi disabled before taking the headset to an exhibition.

## 17. Production server

For a simple production installation:

```bash
npm install
npm run build
npm start
```

You do not need to keep two terminals open. `npm start` supervises both the web/API process and the panorama worker.

For Docker deployment:

```bash
docker compose up -d --build
```

Use HTTPS for the production URL, especially for WebXR/headset use.

## Recommended exhibition workflow

A good routine is:

```text
Duplicate last project
-> edit the draft
-> test on PC
-> test in headset
-> publish
-> open published viewer
-> download published project to headset
-> turn Wi-Fi off and test again
```

That keeps the live exhibition version safe while a new presentation is being prepared.
