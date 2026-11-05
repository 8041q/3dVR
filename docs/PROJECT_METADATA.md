# Project metadata

The **Project** workspace describes the current experience. **Manage projects** is a separate screen for switching, creation, and duplication, accessible from the project menu and Project workspace.

## Field choices

The field set is informed by [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/): title, creator, description, contributor, publisher, language, subject, license, rights, identifier, created, modified, and issued. These are descriptive concepts, not a claim of Dublin Core export conformance.

| Field | Purpose |
| --- | --- |
| Project title | Name of the experience; existing top-level `title` |
| Author | Person or team primarily responsible for creating it |
| Description | Summary and purpose |
| Organization | Studio, company, or institution behind the project |
| Contributors | Credits and acknowledgments, including source media |
| Content language | Language of the content, preferably a tag such as `en` or `pt-PT` |
| Keywords | Comma-separated topics for description and future discovery |
| License | License name or URL; no default license is implied |
| Copyright & usage notes | Rights holder, attribution, or usage restrictions |

The starting scene is a real project setting alongside the descriptive fields. System-maintained dates, identifiers, content counts, and publication revision are read-only. A content language does not change the app locale. Metadata does not configure access control, enforce license terms, or add a viewer credits panel.

## Persistence and compatibility

`metadata` is an optional object in the schema-version-3 snapshot. Its eight fields are bounded strings; missing, blank, non-string, and unrecognized fields normalize to absent values. The field limits live in `src/projectMetadata.js`. The editor preserves spaces while typing; the server trims text on save.

Metadata uses the same draft save, dirty tracking, undo/redo, optimistic revision checks, duplication, and publish flow as scene content. A metadata-only edit changes the content revision. Empty metadata is omitted from the revision hash so existing projects retain their revisions and published status. Metadata does not overwrite the system-managed `meta` object.

Published manifests and immutable versions include metadata. Offline storage retains the complete published manifest. The export/import scripts copy project snapshots without selecting fields, so metadata travels with the bundle. Metadata may be public in published project data, and the editor explicitly tells authors this.

Existing projects do not require migration or additional mandatory fields. Older published versions remain unchanged.
