# Blender spatial scenes for 3DVR

This guide is for a Blender room that already renders your 360 panorama.

The goal is simple:

- desktop keeps using the rendered panorama;
- phone and phone-headset keep using the rendered panorama;
- a tracked VR headset uses the real Blender room so the visitor can lean, crouch and move slightly with real parallax;
- the same hotspot can work in both versions.

You do **not** need to rebuild the room.

## What the exporter creates

For each Blender scene, the exporter creates two files:

```text
my-room-room.glb
my-room.3dvr.json
```

The GLB is the tracked-VR room.

The JSON stores the alignment information and hotspots so the web editor knows where the same hotspot belongs in the panorama and in the real 3D room.

## 1. Install the Blender add-on

The add-on file is:

```text
tools/blender/3dvr_exporter.py
```

In Blender:

1. Open **Edit → Preferences**.
2. Open **Add-ons**.
3. Choose **Install from Disk**.
4. Select `3dvr_exporter.py`.
5. Enable **3DVR Spatial Scene Exporter**.

Return to the 3D Viewport and open the right sidebar with `N`.

There should now be a **3DVR** tab.

## 2. Confirm your scene uses real scale

Tracked VR works best when the Blender room is modeled at real dimensions.

Recommended:

```text
1 Blender meter = 1 real meter
```

For example, a 2-meter bed should measure approximately 2 meters in Blender.

Check this before export because the headset will preserve the room's physical scale.

You do not need to apply object scale just to use 3DVR, but obviously incorrect dimensions should be fixed in the source scene.

## 3. Use the same camera as the 360 render

This is the most important rule.

The camera used to render the equirectangular panorama must also be the camera used to create the spatial origin.

1. Select/open your panorama scene.
2. Make sure the panorama camera is the active **Scene Camera**.
3. In the **3DVR** sidebar choose:

**Use Active Camera as 3DVR Origin**

The add-on creates or updates an Empty named:

```text
3DVR_ORIGIN
```

Do not manually move this Empty afterward unless you intentionally want to change the relationship between the panorama and the spatial room.

### What the origin means

At export time:

- the panorama camera position becomes spatial `(0, 0, 0)`;
- the camera's horizontal forward direction becomes the 3DVR forward direction;
- the room is exported relative to that origin.

This is what lets the web viewer use the same hotspot in the panorama and in tracked VR.

## 4. Set the floor height

In the 3DVR sidebar set **Floor Z** to the Blender world-space Z height of the floor underneath the panorama camera.

If your floor is at Blender Z = 0, leave:

```text
Floor Z = 0
```

The exporter calculates the camera/eye height from this value.

Example:

```text
Camera Z = 1.65 m
Floor Z  = 0.00 m
Camera height = 1.65 m
```

This helps the tracked room line up naturally with the headset's physical floor/reference space.

## 5. Decide what belongs in the VR room

By default, visible Blender mesh objects are exported into the spatial room.

That is intentional: for the first spatial version you should be able to export an existing room without manually tagging hundreds of objects.

### Ignore render-only objects

If an object should not exist in real-time VR:

1. Select it.
2. In the 3DVR panel change **3DVR Role** to **Ignore**.

Good examples:

- render helper geometry;
- hidden light cards;
- high-poly objects replaced by a simpler object;
- objects used only for compositing;
- geometry outside the area a visitor can see.

### Animated furniture stays in the room

Do **not** extract beds, cabinets, doors or other products into separate inspection GLBs just because they move. In the tracked-VR version, the actual Blender room is already the interactive 3D scene.

If an object has a Blender Action/NLA animation, keep that object in the room. Phase 14 exports room animations into the GLB and records the available clip names in the `.3dvr.json` file. A hotspot in the web editor can then use **Play room movement** to trigger the animation directly on the room.

The old **Interactive** role remains only so Phase 13 Blender files do not break; it now exports like a normal room object.

## 6. Create hotspots in Blender

For hotspots that correspond to actual room locations, authoring them in Blender is the preferred workflow.

### Create one

1. Put the Blender **3D Cursor** where the hotspot belongs.
2. In the 3DVR panel choose **Create Hotspot at 3D Cursor**.
3. A new Empty is created.
4. With it selected, configure the hotspot in the 3DVR panel.

Available fields include:

- Hotspot ID
- Label
- Appearance
- Size
- Color
- Opacity
- Target scene ID

### Example: doorway

Place the Empty in the doorway and set:

```text
Label: Kitchen
Appearance: Doorway
Target scene ID: kitchen
```

On export the add-on calculates two positions from that one Empty:

```text
3D spatial position
+
panorama yaw / pitch
```

So the web project does not need two separate hotspot placements.

### Example: product

Place an Empty around the visible bed/product and choose:

```text
Appearance: Product
```

In the web editor you can attach actions such as **Play room movement**, **Show information**, **Start guide**, or scene navigation while keeping the Blender-authored location.

## 7. Export

In the 3DVR panel choose an **Export folder**, then click:

**Export 3DVR Spatial Scene**

The exporter creates:

```text
<scene>-room.glb
<scene>.3dvr.json
```

It temporarily transforms the exported mesh data relative to `3DVR_ORIGIN`, exports the GLB, then restores your Blender objects to their original transforms.

Your production Blender scene should therefore look unchanged after export.

### Exporting object movement

Room animations are exported with the room GLB. For the cleanest result:

1. Give the Blender Action/NLA clip a customer-readable name such as `Open storage` or `Close drawer`.
2. Keep the animated mesh/armature enabled for render/export.
3. Re-export the spatial scene.
4. Re-import the two files in the web editor.
5. On a hotspot, add **Play room movement** and choose the exported clip name.

The movement only renders in tracked VR because desktop/phone deliberately use the pre-rendered panorama. You can put additional universal actions after it, for example **Show information**, so the same hotspot remains useful in panorama modes.


## 8. Import it into the 3DVR editor

Open the matching scene in the web editor.

Go to:

**Scenes → Selected scene → Tracked VR room**

Choose:

**Import Blender room**

Select both files at the same time:

```text
<scene>-room.glb
<scene>.3dvr.json
```

The editor will:

1. upload the room GLB while preserving a safe form of its original filename;
2. attach it to the current scene and retain the manifest `roomFile` identity;
3. import the Blender hotspots;
4. merge matching hotspot IDs instead of blindly creating duplicates.

If the same filename already exists, 3DVR adds a short suffix rather than replacing the existing upload. Older UUID-named uploads remain valid; their original filename can be recorded in `server/data/assets.json` and project migration exports use that human filename.

If a matching hotspot already has web-authored actions, those actions are kept unless the Blender export explicitly supplied actions.

For migration or backup, use `npm run export:project -- <project-id> <destination>`. The resulting bundle includes referenced uploads and panorama assets instead of relying on the ignored `public/uploads/` and `storage/` directories being copied by Git.

## 9. Test the four runtime cases

### Desktop

The rendered panorama is used.

The spatial GLB is not needed for rendering.

### Phone

The rendered panorama is used.

Looking is controlled by device orientation. A center crosshair performs a selection after a 2-second dwell.

Touch is not required for hotspot selection. If the view does not rotate, use **Enable motion** and check the status shown next to the phone controls. Mobile browsers commonly require HTTPS for orientation sensors, so a LAN `http://192.168...` development URL may be blocked; use the project's HTTPS development mode for phone testing.

Use **Recenter view** after rotating the phone or placing it into a headset so the current heading becomes panorama-forward.


### Phone in a plastic VR headset

The same phone panorama runtime is used, with the phone-headset stereo presentation enabled.

Input is still the same 2-second center-crosshair dwell.

### Tracked WebXR headset

When WebXR reports real positional tracking, 3DVR loads the Blender room **instead of the panorama**.

The room is anchored once to the visitor's headset pose when the VR session starts.

After that it does not follow the head. This is why the visitor can:

- lean toward furniture;
- lean sideways;
- crouch;
- take small physical steps;
- see actual parallax.

### WebXR headset without positional tracking

If WebXR reports an emulated position / rotation-only headset, 3DVR falls back to the panorama.

This avoids pretending that a 3DoF device can provide real positional movement.

## 10. Important material limitation

A Blender Cycles render can use shaders that are much more complex than a real-time glTF material.

The spatial GLB is not expected to look identical automatically on the first export.

For a good VR room:

- use sensible Principled BSDF materials where possible;
- keep texture resolutions reasonable;
- avoid unnecessary subdivision/high-poly render geometry;
- bake expensive lighting/detail when useful;
- test on the actual headset.

The panorama remains the maximum-quality representation for desktop/phone modes. The spatial room is optimized for tracked movement and real-time headset performance.

## 11. First scene test recommendation

Do not convert the whole exhibition at once.

Start with one room:

1. duplicate the Blender file if you want a safe test copy;
2. install the add-on;
3. set the panorama camera as origin;
4. set Floor Z;
5. create one doorway hotspot and one product hotspot;
6. export;
7. import into the matching web scene;
8. enter VR on a tracked headset;
9. confirm the panorama is not loaded/shown;
10. physically lean 20–40 cm and confirm the room perspective changes correctly;
11. check hotspot alignment;
12. only then optimize the room and repeat for other scenes.

## Troubleshooting

### The spatial room does not line up with the panorama direction

Run **Use Active Camera as 3DVR Origin** again and confirm the active Scene Camera is exactly the camera used for the panorama render.

### The floor feels too high or low

Check **Floor Z** in Blender and verify the source scene is modeled at real scale.

### A hotspot is correct in Blender but wrong in the panorama

The hotspot and panorama must use the same `3DVR_ORIGIN`. Do not move the panorama camera after generating the origin without regenerating the origin/export.

### The VR room is too heavy

Mark render-only objects **Ignore**, reduce unnecessary geometry, simplify materials and textures, and retest on the headset. The tracked room has a much stricter performance budget than an offline Cycles render.

### I changed Blender hotspot actions later in the web editor

That is fine. The Blender Empty should remain the location source. The web editor can remain the richer action/Guide authoring layer.
