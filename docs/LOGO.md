# Atria 3DVR spatial portal logo

The product name is **Atria 3DVR**. Use the full name in visible branding and app metadata. Existing `3dvr` technical identifiers and asset filenames remain compatible with saved projects and integrations.

The open architectural portal represents immersive spaces. The teal visitor path and endpoint represent guided tours and interactive hotspots.

The production master is `public/brand/3dvr-portal-v2.svg`: hand-authored vector paths, solid fills, and genuinely transparent negative space. The editor and login use this SVG directly. A 2048px transparent PNG export is available alongside it.

The favicon is a separate simplified vector for small sizes. It adapts its colors to the system light/dark preference and has no background. Transparent PNG exports at 16/32/48px and a seven-size transparent ICO provide fallbacks. Standard PWA icons at 192/512px are transparent. Only Apple touch icons and Android maskable icons use an opaque backing; maskable versions have additional safe padding.

Run `python scripts/export-brand-icons.py` with Inkscape and Pillow installed to regenerate exports. Each size is rendered directly from vectors. The application has no new runtime dependencies. Versioned URLs avoid reusing the original raster icon cache.

The original concept was generated using the built-in image generation tool. Its raster assets remain as historical concepts; production references use v2. The vector refinement uses the original portal/path concept, removes raster artifacts, and strengthens small-size details.

## Original concept generation prompt

Use case: logo-brand.
Asset type: final software brand symbol for 3DVR, an immersive exhibition, virtual-tour authoring and interactive 3D product-exploration platform.
Primary request: Create a completely new, distinctive professional logo mark representing entering and exploring an immersive space. Design a single bold geometric open spatial portal: two folded architectural planes suggest an open room in perspective, with a graceful visitor-path curve passing through the opening and terminating in a small circular hotspot. Integrate these into one cohesive, compact, beautifully balanced silhouette; avoid a collection of separate icons. The negative space should clearly convey an inviting passage into depth.
Style/medium: exceptionally refined minimal flat vector-like brand artwork, clean exact edges, few bold shapes, restrained geometry, legible as a small software icon. Suitable for a professional white and navy interface. Deep ink-blue main structure with a restrained teal accent on the path. Flat solid colors, no gradients, no outlines around solid shapes.
Composition: one centered standalone symbol, square canvas, generous consistent transparent margin, mark occupies roughly 76 percent of canvas, no presentation board or mockup.
Text: none.
Constraints: genuinely transparent background. No headset, goggles, eyes, spectacles, controller, literal 3DVR lettering, cube wireframe, globe, generic infinity loop, shadows, bevels, lighting effects, decorative particles, watermark, extra logos. This is an entirely new brand direction, unrelated to a VR-headset pictogram.

