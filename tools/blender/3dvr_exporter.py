bl_info = {
    "name": "3DVR Spatial Scene Exporter",
    "author": "3DVR",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > 3DVR",
    "description": "Export a Blender room aligned with a 3DVR panorama camera",
    "category": "Import-Export",
}

import bpy
import json
import math
import os
from datetime import datetime, timezone
from mathutils import Vector, Matrix
from bpy.props import (
    EnumProperty,
    FloatProperty,
    PointerProperty,
    StringProperty,
)
from bpy.types import Operator, Panel, PropertyGroup

ORIGIN_NAME = "3DVR_ORIGIN"


def safe_id(value):
    text = "".join(c.lower() if c.isalnum() else "-" for c in str(value or "hotspot"))
    text = "-".join(part for part in text.split("-") if part)
    return text[:64] or "hotspot"


def blender_to_gltf_point(v):
    # Blender is X right / Y forward / Z up. Blender's glTF exporter converts
    # that to X right / Y up / -Z forward.
    return [float(v.x), float(v.z), float(-v.y)]


def get_origin(scene):
    return scene.objects.get(ORIGIN_NAME)


def origin_from_camera(scene):
    camera = scene.camera
    if camera is None:
        raise RuntimeError("Set the panorama camera as the active Scene Camera first.")

    forward = camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    forward.z = 0.0
    if forward.length < 1e-6:
        raise RuntimeError("The active camera points vertically. The panorama origin needs a horizontal heading.")
    forward.normalize()

    # 3DVR local +Y becomes glTF -Z (panorama yaw 0 / forward).
    yaw = math.atan2(-forward.x, forward.y)

    origin = scene.objects.get(ORIGIN_NAME)
    if origin is None:
        origin = bpy.data.objects.new(ORIGIN_NAME, None)
        scene.collection.objects.link(origin)
        origin.empty_display_type = 'ARROWS'
        origin.empty_display_size = 0.35

    origin.location = camera.matrix_world.translation
    origin.rotation_euler = (0.0, 0.0, yaw)
    origin["3dvr_role"] = "ORIGIN"
    return origin


def object_role(obj):
    settings = getattr(obj, "vr3dvr", None)
    if settings and settings.role:
        return settings.role
    return str(obj.get("3dvr_role", "STATIC")).upper()


def room_meshes(scene):
    return [obj for obj in room_export_objects(scene) if obj.type == 'MESH']


def room_export_objects(scene):
    output = []
    for obj in scene.objects:
        if obj.type not in {'MESH', 'ARMATURE'}:
            continue
        if object_role(obj) == 'IGNORE':
            continue
        if obj.hide_render:
            continue
        output.append(obj)
    return output


def animation_names(objects):
    names = []
    seen = set()

    def add(name):
        name = str(name or '').strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)

    for obj in objects:
        animation_data = getattr(obj, 'animation_data', None)
        if not animation_data:
            continue
        if animation_data.action:
            add(animation_data.action.name)
        for track in animation_data.nla_tracks:
            for strip in track.strips:
                if strip.action:
                    add(strip.action.name)
                else:
                    add(strip.name)

    return names


def hotspot_objects(scene):
    return [obj for obj in scene.objects if object_role(obj) == 'HOTSPOT']


def bounds_for_objects(objects, origin_inverse):
    points = []
    for obj in objects:
        local_matrix = origin_inverse @ obj.matrix_world
        for corner in obj.bound_box:
            p = local_matrix @ Vector(corner)
            points.append(Vector(blender_to_gltf_point(p)))
    if not points:
        return None
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return {"min": list(minimum), "max": list(maximum)}


def hotspot_record(obj, origin_inverse):
    settings = obj.vr3dvr
    local = origin_inverse @ obj.matrix_world.translation
    spatial = blender_to_gltf_point(local)
    length = max(1e-9, math.sqrt(sum(value * value for value in spatial)))
    yaw = math.degrees(math.atan2(spatial[0], -spatial[2]))
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, spatial[1] / length))))

    hotspot_id = safe_id(settings.hotspot_id or obj.name)
    actions = []
    if settings.target_scene.strip():
        actions.append({
            "id": f"action-{hotspot_id}-navigate",
            "type": "navigate-scene",
            "sceneId": settings.target_scene.strip(),
        })

    return {
        "id": hotspot_id,
        "label": settings.hotspot_label.strip() or obj.name,
        "size": max(0.1, float(settings.hotspot_size)),
        "position": {"yaw": yaw, "pitch": pitch},
        "spatialPosition": spatial,
        "style": {
            "preset": settings.hotspot_preset,
            "color": settings.hotspot_color,
            "opacity": float(settings.hotspot_opacity),
        },
        "actions": actions,
    }


def gltf_export_kwargs(filepath):
    desired = {
        "filepath": filepath,
        "export_format": 'GLB',
        "use_selection": True,
        "export_yup": True,
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": True,
        "export_apply": True,
    }
    try:
        available = {prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties}
        return {key: value for key, value in desired.items() if key in available}
    except Exception:
        return desired


class VR3DVRObjectSettings(PropertyGroup):
    role: EnumProperty(
        name="3DVR Role",
        items=[
            ('STATIC', "Room / Static", "Export as part of the tracked room"),
            ('INTERACTIVE', "Room object (legacy)", "Legacy Phase 13 value; exports normally as part of the room"),
            ('HOTSPOT', "Hotspot", "Export this Empty as a shared panorama/spatial hotspot"),
            ('IGNORE', "Ignore", "Do not export this object"),
        ],
        default='STATIC',
    )
    hotspot_id: StringProperty(name="Hotspot ID", default="")
    hotspot_label: StringProperty(name="Label", default="")
    hotspot_preset: EnumProperty(
        name="Appearance",
        items=[
            ('navigation', "Navigation", "General navigation marker"),
            ('floor', "Floor", "Wide floor marker"),
            ('doorway', "Doorway", "Door / opening marker"),
            ('window', "Window", "Window marker"),
            ('product', "Product", "Product marker"),
            ('info', "Information", "Information marker"),
        ],
        default='navigation',
    )
    hotspot_size: FloatProperty(name="Size", default=1.0, min=0.1, max=8.0)
    hotspot_color: StringProperty(name="Color", default="#f5f7fa")
    hotspot_opacity: FloatProperty(name="Opacity", default=0.92, min=0.05, max=1.0)
    target_scene: StringProperty(name="Target scene ID", default="")


class VR3DVR_OT_set_origin(Operator):
    bl_idname = "vr3dvr.set_origin"
    bl_label = "Use Active Camera as 3DVR Origin"
    bl_description = "Create/update 3DVR_ORIGIN from the active panorama camera"

    def execute(self, context):
        try:
            origin = origin_from_camera(context.scene)
            self.report({'INFO'}, f"3DVR origin set at {tuple(round(v, 3) for v in origin.location)}")
            return {'FINISHED'}
        except Exception as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}


class VR3DVR_OT_create_hotspot(Operator):
    bl_idname = "vr3dvr.create_hotspot"
    bl_label = "Create Hotspot at 3D Cursor"

    def execute(self, context):
        obj = bpy.data.objects.new("HOTSPOT_New", None)
        context.scene.collection.objects.link(obj)
        obj.location = context.scene.cursor.location
        obj.empty_display_type = 'SPHERE'
        obj.empty_display_size = 0.14
        obj.vr3dvr.role = 'HOTSPOT'
        obj.vr3dvr.hotspot_id = safe_id(obj.name)
        obj.vr3dvr.hotspot_label = "New hotspot"
        context.view_layer.objects.active = obj
        obj.select_set(True)
        return {'FINISHED'}


class VR3DVR_OT_export(Operator):
    bl_idname = "vr3dvr.export_scene"
    bl_label = "Export 3DVR Spatial Scene"
    bl_description = "Export room.glb and scene.3dvr.json aligned to the panorama camera"

    def execute(self, context):
        scene = context.scene
        origin = get_origin(scene)
        if origin is None:
            try:
                origin = origin_from_camera(scene)
            except Exception as exc:
                self.report({'ERROR'}, str(exc))
                return {'CANCELLED'}

        export_dir = bpy.path.abspath(scene.vr3dvr_export_dir or "//3dvr_export/")
        os.makedirs(export_dir, exist_ok=True)
        blend_stem = safe_id(os.path.splitext(os.path.basename(bpy.data.filepath or "scene"))[0])
        room_name = f"{blend_stem}-room.glb"
        json_name = f"{blend_stem}.3dvr.json"
        room_path = os.path.join(export_dir, room_name)
        json_path = os.path.join(export_dir, json_name)

        export_objects = room_export_objects(scene)
        meshes = [obj for obj in export_objects if obj.type == 'MESH']
        if not meshes:
            self.report({'ERROR'}, "No visible mesh objects are available to export.")
            return {'CANCELLED'}

        origin_inverse = origin.matrix_world.inverted()
        saved_matrices = {obj: obj.matrix_world.copy() for obj in export_objects}
        saved_selection = {obj: obj.select_get() for obj in scene.objects}
        saved_active = context.view_layer.objects.active

        try:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in export_objects:
                # Translation + heading normalization only. 3DVR_ORIGIN itself is
                # kept level, so Blender remains Z-up and glTF's Y-up conversion
                # stays correct.
                obj.matrix_world = origin_inverse @ saved_matrices[obj]
                obj.select_set(True)

            context.view_layer.objects.active = export_objects[0]
            bpy.ops.export_scene.gltf(**gltf_export_kwargs(room_path))
        except Exception as exc:
            self.report({'ERROR'}, f"glTF export failed: {exc}")
            return {'CANCELLED'}
        finally:
            for obj, matrix in saved_matrices.items():
                obj.matrix_world = matrix
            bpy.ops.object.select_all(action='DESELECT')
            for obj, selected in saved_selection.items():
                try:
                    obj.select_set(selected)
                except Exception:
                    pass
            context.view_layer.objects.active = saved_active

        floor_z = float(scene.vr3dvr_floor_z)
        camera_height = float(origin.location.z - floor_z)
        hotspots = [hotspot_record(obj, origin_inverse) for obj in hotspot_objects(scene)]
        animations = animation_names(export_objects)

        manifest = {
            "schemaVersion": 1,
            "kind": "3dvr-blender-spatial-scene",
            "source": "Blender",
            "sourceScene": scene.name,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "roomFile": room_name,
            "coordinateSystem": "camera-origin-y-up-forward-minus-z",
            "cameraHeight": camera_height,
            "bounds": bounds_for_objects(meshes, origin_inverse),
            "hotspots": hotspots,
            "animations": animations,
        }

        with open(json_path, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, ensure_ascii=False)

        self.report({'INFO'}, f"Exported {room_name} + {json_name} ({len(hotspots)} hotspots, {len(animations)} animations)")
        return {'FINISHED'}


class VR3DVR_PT_panel(Panel):
    bl_label = "3DVR"
    bl_idname = "VR3DVR_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = '3DVR'

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        obj = context.active_object

        box = layout.box()
        box.label(text="Spatial origin")
        box.operator("vr3dvr.set_origin")
        origin = get_origin(scene)
        box.label(text="Ready" if origin else "Not set", icon='CHECKMARK' if origin else 'ERROR')
        box.prop(scene, "vr3dvr_floor_z")

        box = layout.box()
        box.label(text="Hotspots")
        box.operator("vr3dvr.create_hotspot")

        if obj:
            settings = obj.vr3dvr
            box = layout.box()
            box.label(text=f"Selected: {obj.name}")
            box.prop(settings, "role")
            if settings.role == 'HOTSPOT':
                box.prop(settings, "hotspot_id")
                box.prop(settings, "hotspot_label")
                box.prop(settings, "hotspot_preset")
                box.prop(settings, "hotspot_size")
                box.prop(settings, "hotspot_color")
                box.prop(settings, "hotspot_opacity")
                box.prop(settings, "target_scene")

        box = layout.box()
        box.label(text="Export")
        box.prop(scene, "vr3dvr_export_dir")
        box.operator("vr3dvr.export_scene", icon='EXPORT')
        box.label(text="Visible meshes export by default.")
        box.label(text="Use Ignore for render-only helpers.")


classes = (
    VR3DVRObjectSettings,
    VR3DVR_OT_set_origin,
    VR3DVR_OT_create_hotspot,
    VR3DVR_OT_export,
    VR3DVR_PT_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Object.vr3dvr = PointerProperty(type=VR3DVRObjectSettings)
    bpy.types.Scene.vr3dvr_export_dir = StringProperty(
        name="Export folder",
        subtype='DIR_PATH',
        default="//3dvr_export/",
    )
    bpy.types.Scene.vr3dvr_floor_z = FloatProperty(
        name="Floor Z",
        description="World-space Z height of the floor at the panorama camera",
        default=0.0,
        unit='LENGTH',
    )


def unregister():
    del bpy.types.Scene.vr3dvr_floor_z
    del bpy.types.Scene.vr3dvr_export_dir
    del bpy.types.Object.vr3dvr
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
