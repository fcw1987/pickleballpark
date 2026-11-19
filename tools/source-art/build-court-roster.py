"""Build the three atlas teammates from the approved editable Emerald rig (Blender 4.3).

Run in background Blender with --python or with its bpy Python distribution.
Drawing coordinates are (front-view x, forward depth, height) in 6 mm units.
The four-angle atlas in source-art/reference-athletes is the costume model sheet.
"""
from math import sin, cos, pi, sqrt, exp, radians, atan2
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "source-art/athletes"
UNIT = .006
TAU = 2 * pi
PALETTES = {
    "cream-visor": dict(Skin="BF794C", Warm="9E593C", Smile="84452F", Hair="31272B",
                        Chestnut="473335", Hairlight="57403C", Emerald="80CD98", Pine="54A77D",
                        Bill="FFEDC9", Seam="DDC5A1", Indigo="436F5A", Mint="9CDBB1"),
    "coral-ponytail": dict(Skin="FFA76B", Warm="DE895F", Smile="AB6041", Hair="58352B",
                           Chestnut="78452D", Hairlight="955739", Emerald="F36550", Pine="D14F40",
                           Bill="FFF0D4", Seam="DCC2A0", Indigo="44516B", Mint="FFA891"),
    "navy-cap": dict(Skin="BB774E", Warm="945739", Smile="80452F", Hair="342C32",
                     Chestnut="493A37", Hairlight="564139", Emerald="FF882F", Pine="DF6925",
                     Bill="3C5489", Seam="2F4170", Navy="393D4C", Indigo="444B60", Mint="F4C68E"),
}
NAMES = {"cream-visor": "Cream Visor", "coral-ponytail": "Coral Ponytail", "navy-cap": "Navy Cap"}


def xyz(p):
    return Vector((p[0]*UNIT, -p[1]*UNIT, p[2]*UNIT))


def coords(v):
    return v.x/UNIT, -v.y/UNIT, v.z/UNIT


def color(mat, hexcolor):
    srgb = [int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    rgba = (*(s/12.92 if s <= .04045 else ((s+.055)/1.055)**2.4 for s in srgb), 1)
    mat.diffuse_color = rgba
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = rgba


def swatch(name, value):
    m = bpy.data.materials["Ivory"].copy()
    m.name = name
    color(m, value)
    return m


def replace_material(obj, old, new):
    for slot in obj.material_slots:
        if slot.material.name == old:
            slot.material = new


class Headpiece:
    """Several sculpted volumes in one editable, head-weighted mesh with ink silhouettes."""
    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.colors = [], [], []

    def loft(self, rings, paint, ink=.75, facepaint=None):
        n, h = len(rings[0]), len(rings)
        verts = [xyz(p) for row in rings for p in row]
        faces = [(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j)
                 for i in range(h-1) for j in range(n)]
        faces += [tuple(reversed(range(n))),tuple((h-1)*n+j for j in range(n))]
        # Reflect drawing depth into Blender -Y and orient the hull outwards.
        signed = sum(verts[f[0]].dot(verts[f[i]].cross(verts[f[i+1]]))
                     for f in faces for i in range(1,len(f)-1))
        if signed < 0:
            faces = [tuple(reversed(f)) for f in faces]
        colors = ([facepaint(i,j) for i in range(h-1) for j in range(n)] + [paint,paint]
                  if facepaint else [paint]*len(faces))
        def add(vs, fs, ms):
            offset = len(self.verts)
            self.verts.extend(vs)
            self.faces.extend(tuple(offset+i for i in f) for f in fs)
            self.colors.extend(ms)
        add(verts,faces,colors)
        if ink:
            normals = [Vector((0,0,0)) for _ in verts]
            for f in faces:
                normal = sum((verts[f[i]].cross(verts[f[(i+1)%len(f)]]) for i in range(len(f))),Vector()).normalized()
                for i in f:
                    normals[i] += normal
            add([v+n.normalized()*ink*UNIT for v,n in zip(verts,normals)],
                [tuple(reversed(f)) for f in faces],["Outline"]*len(faces))

    def finish(self, rig):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(self.name,mesh)
        bpy.context.scene.collection.objects.link(obj)
        slots = list(dict.fromkeys(self.colors))
        for name in slots:
            mesh.materials.append(bpy.data.materials[name])
        for face, name in zip(mesh.polygons,self.colors):
            face.material_index = slots.index(name)
            face.use_smooth = True
        obj.parent = rig
        obj.vertex_groups.new(name="Head").add(list(range(len(self.verts))),1.,"REPLACE")
        obj.modifiers.new("Follow head","ARMATURE").object = rig


def ring(n, func):
    return [func(TAU*j/n) for j in range(n)]


def sections(piece, stations, paint, ink=.65, sides=28):
    # Freeform sections of a lock, independent front width and profile depth.
    piece.loft([ring(sides,lambda a:(x+rx*sin(a),d+rd*cos(a),z+tilt*sin(a)))
                for x,d,z,rx,rd,tilt in stations],paint,ink)


def crop_hair(style, rig):
    piece = Headpiece("Taper and temples" if style!="coral-ponytail" else "Bangs and nape")
    coral = style=="coral-ponytail"
    def hair(a,t):
        front,back = max(0.,cos(a)), max(0.,-cos(a))
        bottom = 176 + 23*front**1.4 - 22*back
        if coral:
            bottom -= 6*back + 4*sin(7*a+.3)**2
        else:
            bottom += 1.7*sin(4*a+1) + 2*sin(7*a+.6)**2
        z=bottom+(216-bottom)*t
        # The cropped style hugs the independently shaped face sections at
        # each height. Projecting a cylinder here exposes skin at the nape.
        sections_at=[(140,12,30,7),(146,34,51,-24),(152,42,55,-34),
                     (159,48,56,-40),(167,52,55,-45),(176,53.5,54,-49),
                     (186,54,53,-51),(199,54,51,-52),(211,49,46,-48),(219,38,37,-37)]
        lo,hi=next((p,q) for p,q in zip(sections_at,sections_at[1:]) if p[0]<=z<=q[0])
        f=(z-lo[0])/(hi[0]-lo[0])
        w,fore,rear=[p+(q-p)*f for p,q in zip(lo[1:],hi[1:])]
        cap_edge=191+22*front**1.45-4*back if style!="cream-visor" else 198+14*front**1.3-5*back
        under=min(1,max(0,(z-cap_edge+5)/11))
        under=under*under*(3-2*under)
        w*={"navy-cap":1.025,"coral-ponytail":.976,"cream-visor":1.015}[style]
        thickness=.90+(1-under)*(1.0+3.6*sin(t*pi)+1.6*back)
        def signed(v,n):
            return abs(v)**n if v>=0 else -abs(v)**n
        return ((w+thickness)*signed(sin(a),.86),(fore+rear)/2+
                ((fore-rear)/2+thickness)*signed(cos(a),.80),z)
    piece.loft([ring(88,lambda a:hair(a,t)) for t in (0,.08,.2,.36,.52,.7,.86,1)],"Hair",.8)
    for s in (-1,1):
        sections(piece,[(s*44,22,203,5,6,0),(s*49,28,192,7.8,8.2,0),
                        (s*48,30,183,6,6,0),(s*48,30,176 if not coral else 171,1,2,0)],"Chestnut")
    if style!="cream-visor":
        sections(piece,[(10,46,209,19,5,1),(8,52,204,18,5,2),(2,54,199,12,4,2),
                        (-7,54,193,5,2,1),(-12,53,191,1.1,.7,0)],"Chestnut")
        sections(piece,[(-21,42,209,13,4,2),(-27,50,201,13,4,1),
                        (-34,50,195,5,3,2),(-41,44,192,1,1,0)],"Hair")
    if coral:
        for s in (-1,1):
            sections(piece,[(s*48,0,197,6,10,1),(s*54,2,182,8,11,1),
                            (s*54,2,168,7,10,-1),(s*59,1,154,4.8,6,-2),(s*63,-1,153,1,1,0)],"Chestnut")
        sections(piece,[(0,-46,189,24,11,-3),(-3,-52,172,23,12,4),
                        (0,-53,152,18,10,4),(-4,-50,139,12,8,3),(-12,-49,134,1,2,0)],"Chestnut")
    piece.finish(rig)


def visor(rig):
    # Tight textured curls form a single crown. A staggered field of overlapping
    # shallow caps gives the contour its small irregular lobes at every azimuth.
    hair = Headpiece("Short curls")
    seeds = []
    for row,(lat,n) in enumerate(((.02,17),(.27,17),(.53,15),(.79,13),(1.04,10),(1.28,7),(1.49,3))):
        for j in range(n):
            a=TAU*(j+.47*(row%2)+.10*sin(j*13+row))/n
            l=lat+.04*sin(j*5.2+row*1.6)
            seeds.append((cos(l)*sin(a),cos(l)*cos(a),sin(l),6.3+2.0*sin(j*3.4+row)))
    def bandbase(a):
        return 198+14*max(0.,cos(a))**1.3-5*max(0.,-cos(a))
    def relief(a,l):
        x,y,z=cos(l)*sin(a),cos(l)*cos(a),sin(l)
        return max((r*exp(-49*(1-min(1.,x*sx+y*sy+z*sz))),sz) for sx,sy,sz,r in seeds)
    def curl(a,l):
        delta=relief(a,l)[0]
        base=bandbase(a)+18
        # The curls narrow inside the open band, then swell over its upper seam.
        t=max(0,min(1,(l+.10)/.23))
        w=54+t*6+t*delta
        return (cos(l)*sin(a)*w,-1+cos(l)*cos(a)*(w-1),base+(263+delta-base)*sin(l))
    lats=[-.16+i*1.727/40 for i in range(41)]
    def curlcolor(i,j):
        a=TAU*(j+.5)/112;l=(lats[i]+lats[i+1])*.5
        r,seed=relief(a,l)
        if r>5.4 and sin(l)>seed-.015:return "Curl glints"
        return "Curl midtone" if r>3.9 else "Hair"
    swatch("Curl midtone","413132");swatch("Curl glints","4F3B39")
    hair.loft([ring(112,lambda a:curl(a,l)) for l in lats],"Hair",1.,curlcolor)
    hair.finish(rig)
    band=Headpiece("Open cream visor")
    def bandpoint(a,h,w):
        return ((60.8+w)*sin(a),-1+(59.8+w)*cos(a),bandbase(a)+h)
    band.loft([ring(72,lambda a:bandpoint(a,h,w)) for h,w in
               [(0,-3),(-1,0),(1,1.8),(5,2.2),(14,2.1),(17,1.2),(18,-3)]],"Visor cream",.85,
              lambda i,j:"Visor seam" if i==2 else "Visor cream")
    band.finish(rig)


def sweep(piece, stations, paint, ink, highlight=None):
    # Cross-sections stay perpendicular to the spline through the high tie,
    # the crown of the tail and the curled ends.
    keys=[Vector((*p[:3],)) for p in stations]
    frames=[];widths=[];depths=[]
    for i in range(len(keys)-1):
        p0,p1,p2,p3=(keys[max(0,min(len(keys)-1,k))] for k in (i-1,i,i+1,i+2))
        for j in range(5):
            t=j/5
            frames.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
            widths.append(stations[i][3]*(1-t)+stations[i+1][3]*t)
            depths.append(stations[i][4]*(1-t)+stations[i+1][4]*t)
    frames.append(keys[-1]);widths.append(stations[-1][3]);depths.append(stations[-1][4])
    across=Vector((1,0,0));rows=[]
    for i,center in enumerate(frames):
        tangent=(frames[min(len(frames)-1,i+1)]-frames[max(i-1,0)]).normalized()
        across=(across-tangent*tangent.dot(across)).normalized()
        deep=tangent.cross(across)
        def profile(a):
            flute=1+.043*cos(3*a+i*.027)+.024*cos(5*a-.5)
            return center+across*(widths[i]*cos(a)*flute)+deep*(depths[i]*sin(a)*flute)
        rows.append(ring(36,profile))
    def bands(i,j):
        return highlight if highlight and 6<j+.85*sin(i/7)<12 and .12<i/len(rows)<.86 else paint
    piece.loft(rows,paint,ink,bands)


def ponytail(rig):
    tie=Headpiece("Coral hair tie")
    sweep(tie,[(-25,-31,232,8,9),(-30,-37,237,12,13),(-33,-40,240,12.8,13),
               (-36,-43,243,11,12)],"Tie red",.55)
    tie.finish(rig)
    hair=Headpiece("High swept ponytail")
    sweep(hair,[(-31,-37,238,8,8),(-38,-46,247,14,14),(-49,-54,254,17,18),
                (-58,-62,251,18,19),(-65,-68,235,20,19),(-68,-75,215,19,18),
                (-73,-83,201,18,16),(-81,-91,188,15,15),(-83,-92,174,13,12),
                (-79,-88,162,8,8),(-72,-85,156,.9,1.0)],"Chestnut",1.0,"Hairlight")
    sweep(hair,[(-60,-70,238,7,9),(-63,-73,222,10,10),(-61,-75,206,11,10),
                (-64,-79,193,11,11),(-66,-82,180,8,9),(-63,-80,168,4,6),
                (-57,-76,164,.7,1)],"Chestnut",.50)
    sweep(hair,[(-68,-79,217,6.8,8),(-76,-86,205,8,9),(-84,-100,198,8,8),
                (-92,-113,195,5,5),(-99,-119,201,.7,.8)],"Chestnut",.50)
    hair.finish(rig)


def sculpt_head(obj,style):
    for vert in obj.data.vertices:
        x,d,z=coords(vert.co)
        cheek=exp(-((z-162)/15)**2)
        if style=="cream-visor":
            x*=1.012+.025*cheek
            d+=.9*cheek
        elif style=="coral-ponytail":
            x*=.976-.045*cheek
            d-=.8*cheek
            z-=1.1*exp(-((z-145)/9)**2)
        else:
            x*=1.025-.023*cheek
            d+=1.8*cheek
        vert.co=xyz((x,d,z))


def build(style):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/"emerald-cap/emerald-cap.blend"))
    bpy.context.preferences.filepaths.save_version=0
    rig=bpy.data.objects["Emerald Cap"]
    rig.name=NAMES[style]
    rig.data.name=rig.name+" skeleton"
    for key,value in PALETTES[style].items():
        if key in bpy.data.materials:
            color(bpy.data.materials[key],value)
        else:
            swatch(key,value)
    head=bpy.data.objects["Head"]
    sculpt_head(head,style)
    sculpt_head(bpy.data.objects["Face"],style)
    bpy.data.objects.remove(bpy.data.objects["Hair"],do_unlink=True)
    crop_hair(style,rig)
    cap=bpy.data.objects["Ball cap"]
    cream=style!="navy-cap"
    hat=swatch("Visor cream" if cream else "Navy twill","FBE8C6" if cream else "344A7D")
    brimedge=swatch("Brim underside","D1B69A" if cream else "27375E")
    replace_material(cap,"Emerald",hat)
    replace_material(cap,"Pine",brimedge)
    if style=="cream-visor":
        # Retain only the editable brim and its ink hull. The cap, strap and
        # button are separate mesh islands; a visor has no closed crown.
        import bmesh
        bm=bmesh.new()
        bm.from_mesh(cap.data)
        unseen=set(bm.verts)
        remove=[]
        while unseen:
            first=unseen.pop()
            island={first}
            todo=[first]
            while todo:
                for edge in todo.pop().link_edges:
                    for v in edge.verts:
                        if v in unseen:
                            unseen.remove(v);island.add(v);todo.append(v)
            if max(-v.co.y for v in island)<.49:
                remove.extend(island)
        bmesh.ops.delete(bm,geom=remove,context="VERTS")
        bm.to_mesh(cap.data);bm.free()
        cap.name="Visor bill"
        for v in cap.data.vertices:
            x,d,z=coords(v.co)
            v.co=xyz((x*1.035, d*.94, z-3.8))
        swatch("Visor seam","EBD2AE")
        visor(rig)
    elif style=="coral-ponytail":
        for v in cap.data.vertices:
            x,d,z=coords(v.co)
            v.co=xyz((x*.977,d*.97,z-1.6))
        swatch("Tie red","D95644")
        ponytail(rig)
    else:
        for v in cap.data.vertices:
            x,d,z=coords(v.co)
            v.co=xyz((1.035*x,d*(1.02 if d<58 else .97),194+(z-194)*.92-1.4))
    # Shape the cut and hem without moving wrist, grip or shoe landmarks.
    jersey=bpy.data.objects["Polo and collar"]
    for v in jersey.data.vertices:
        x,d,z=coords(v.co)
        if style=="coral-ponytail":
            x*=1-.095*exp(-((z-102)/20)**2)
            d*=.95
        else:
            x*=1+(.038 if style=="navy-cap" else .025)*exp(-((z-118)/19)**2)
        v.co=xyz((x,d,z))
    arms=bpy.data.objects["Arms"]
    for v in arms.data.vertices:
        x,d,z=coords(v.co)
        s=-1 if x<0 else 1
        el=107
        ratio=max(0,min(1,(z-86)/(el-86)))
        cx=s*(58-5*ratio) if z<el else s*(53-(z-el)*22/28)
        width=.92 if style=="coral-ponytail" else .965 if style=="cream-visor" else 1.025
        v.co=xyz((cx+(x-cx)*width,d,z))
    shoes=bpy.data.objects["Court shoes"]
    panels=swatch("Shoe panels",{"cream-visor":"388362","coral-ponytail":"D8BD95","navy-cap":"344879"}[style])
    replace_material(shoes,"Indigo",panels)
    if style=="cream-visor":
        upper=swatch("Green uppers","4E9A70")
        shoes.data.materials.append(upper)
        for face in shoes.data.polygons:
            if shoes.data.materials[face.material_index].name=="Ivory" and face.center.z>8.2*UNIT:
                face.material_index=len(shoes.data.materials)-1
    if style=="navy-cap":
        replace_material(bpy.data.objects["Legs and socks"],"Emerald",bpy.data.materials["Indigo"])
    scene=bpy.context.scene
    folder=SOURCE/style
    folder.mkdir(exist_ok=True)
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/(style+".blend")),compress=True)
    rig.animation_data.action=None
    for bone in rig.pose.bones:
        bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(ROOT/"assets/athletes"/(style+".glb")),export_format="GLB",
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_yup=True,
        export_all_influences=False, export_extras=False, export_cameras=False, export_lights=False)


for athlete in NAMES:
    build(athlete)
