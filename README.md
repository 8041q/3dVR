# 3D VR Viewer (React + R3F)

This small project renders equirectangular panoramas and supports clickable hotspots that navigate between scenes.
It now includes PC mode, phone motion mode, and headset VR mode.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Place your panoramas (PNG or JPG, equirectangular) into `public/assets/panoramas/`.

3. Run dev server:

```bash
npm run dev
```

4. Restart the dev server after config changes, then open the HTTPS URL shown by Vite on your phone, for example:

```bash
https://192.168.x.x:5173/
```

5. Accept the certificate warning, switch to Phone Mode, tap Enable Motion, and move the phone.

Files of interest

- `src/components/Viewer.jsx` — main viewer using `@react-three/fiber`.
- `src/components/Hotspot.jsx` — hotspot UI attached to 3D positions.
- `src/data/scenes.json` — scene map and hotspot definitions.

Next steps

- Replace placeholder panorama files with your 4K PNGs named `pano1.png`, `pano2.png`, or update `scenes.json`.
- Add crossfade transitions and preloading for smoother navigation.
- Add mobile/touch tuning and optional WebXR support.

Phone testing notes

- Phone Mode uses `deviceorientation` on the normal canvas. It does not require a headset.
- Headset VR still uses WebXR and only works on browsers/devices with `immersive-vr` support.
- Phone sensors require a secure context. Opening the PC's LAN IP over plain HTTP will usually fail.
- The included Vite HTTPS setup generates a self-signed certificate that covers localhost and your current LAN IPv4 addresses.
- If your Wi-Fi IP changes, restart the dev server so the certificate is regenerated for the new address.
- If forward feels wrong after enabling motion, use the Recenter button in the Phone Mode panel.

Adding more panoramas and hotspots

- Put new panorama files in `public/assets/panoramas/` and reference them from `src/data/scenes.json` using the `src` property.
- Hotspots can be defined either as a 3D coordinate array `[x,y,z]` (world units inside the sphere) or as `{ "yaw": <deg>, "pitch": <deg>, "dist": <optional> }` where `yaw` is horizontal angle in degrees (0 = forward), `pitch` is vertical angle in degrees, and `dist` is distance from center (default ~490).
- Example scene entry:

```json
{
	"id": "garden",
	"title": "Garden",
	"src": "/assets/panoramas/garden.png",
	"hotspots": [
		{ "id": "to-house", "label": "Enter House", "position": { "yaw": 45, "pitch": -5 }, "target": "house" }
	]
}
```

When you add files, update `src/data/scenes.json` and reload the dev server page.
