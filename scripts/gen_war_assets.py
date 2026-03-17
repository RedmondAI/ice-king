"""
Generate war factory tile art matching the Ice King pixel art style.
256x256 tiles: summer, winter, and 3x3 transition grid (768x768).
"""
from PIL import Image, ImageDraw
import os, math

TILE = 256
ASSETS = os.path.join(os.path.dirname(__file__), '../apps/client/src/assets')

# ── helpers ──────────────────────────────────────────────────────────────────

def load(path):
    return Image.open(path).convert('RGBA')

def get_frame(grid, row, col, size=TILE):
    return grid.crop((col*size, row*size, (col+1)*size, (row+1)*size))

def lerp_col(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(4))

def composite(base, overlay):
    return Image.alpha_composite(base.convert('RGBA'), overlay.convert('RGBA'))

def draw_stone_blocks(d, x1, y1, x2, y2, col_face, col_mortar, brick_h=12, brick_w=32):
    """Fill a rect with a running-bond brick/stone pattern."""
    row = 0
    for gy in range(y1, y2, brick_h):
        d.line([(x1, gy), (x2, gy)], fill=col_mortar, width=1)
        offset = 0 if row % 2 == 0 else brick_w // 2
        for gx in range(x1 + offset, x2, brick_w):
            d.line([(gx, gy), (gx, min(gy + brick_h, y2))], fill=col_mortar, width=1)
        row += 1

# ── colour palette ───────────────────────────────────────────────────────────

# Stone
ST_DK  = (52,  52,  68,  255)
ST_MID = (72,  72,  92,  255)
ST_LT  = (96,  96, 118,  255)
ST_HI  = (120, 120, 145, 255)
MORTAR = (38,  38,  52,  255)
# Highlight lip on top of stone
ST_TOP = (130, 130, 155, 255)

# Ice cannon
ICE_HI  = (190, 245, 255, 255)
ICE_MID = (80,  195, 235, 255)
ICE_DK  = (30,  130, 180, 255)
ICE_SHD = (15,   85, 130, 255)

# Metal
MET_DK  = (50,  50,  58,  255)
MET_MID = (78,  78,  90,  255)
MET_LT  = (115, 115, 128, 255)

# Wood / gate
WD_DK  = (55,  35,  15,  255)
WD_MID = (80,  55,  28,  255)
IRON   = (65,  65,  75,  255)

# Banner
BAN_RED  = (185, 28,  28,  255)
BAN_DK   = (120, 15,  15,  255)

# Snow
SNW_HI  = (240, 248, 255, 255)
SNW_MID = (210, 224, 242, 255)
SNW_SHD = (180, 200, 225, 255)

# Ground
GND_DK  = (72,  58,  38,  255)
GND_MID = (92,  75,  50,  255)

# ── building draw function ───────────────────────────────────────────────────

def draw_building(img: Image.Image, snow: float = 0.0) -> Image.Image:
    """
    Draw the war-factory building onto img (in place, returns new image).
    snow ∈ [0,1]  0=summer  1=full winter
    """
    img = img.copy().convert('RGBA')
    d   = ImageDraw.Draw(img)

    # ── ground shadow ────────────────────────────────────────────────────────
    sh = Image.new('RGBA', (TILE, TILE), (0,0,0,0))
    sd = ImageDraw.Draw(sh)
    sd.ellipse([52, 188, 210, 214], fill=(0,0,0,55))
    img = composite(img, sh); d = ImageDraw.Draw(img)

    # ── dirt ground patch ────────────────────────────────────────────────────
    d.polygon([(50,195),(45,208),(215,208),(210,195)], fill=GND_DK)
    d.polygon([(55,190),(50,196),(210,196),(205,190)], fill=GND_MID)

    # ── geometry constants ───────────────────────────────────────────────────
    WX1, WX2 = 54, 202   # main wall x range
    WY_TOP    = 105       # top of battlement base
    WY_BOT    = 198       # bottom of wall
    WALL_TOP  = WY_TOP + 10  # top of wall front face (below battlement)

    # tower
    TX1, TX2 = 40, 82
    TY_TOP    = 55
    TY_BOT    = WY_BOT

    # right battlement block (shorter, anchors the cannon)
    RBX1, RBX2 = 168, 214
    RBY_TOP     = WY_TOP - 5
    RBY_BOT     = WY_BOT

    # cannon platform
    PL_X1, PL_X2 = 170, 228
    PL_Y1, PL_Y2 = 148, 165

    # gate
    GX1, GX2 = 108, 153
    GY1       = WALL_TOP
    GY2       = WY_BOT

    # ── right battlement block ───────────────────────────────────────────────
    # top face
    d.polygon([(RBX1,RBY_TOP),(RBX2,RBY_TOP),(RBX2+6,RBY_TOP+8),(RBX1+6,RBY_TOP+8)],
              fill=ST_LT)
    d.rectangle([RBX1, RBY_TOP+8, RBX2, RBY_BOT], fill=ST_MID)
    draw_stone_blocks(d, RBX1, RBY_TOP+8, RBX2, RBY_BOT, ST_MID, MORTAR, 11, 28)
    # side face
    d.polygon([(RBX2,RBY_TOP+8),(RBX2+6,RBY_TOP+8),(RBX2+6,RBY_BOT),(RBX2,RBY_BOT)],
              fill=ST_DK)

    # ── main wall (back of front face) ───────────────────────────────────────
    # 3-D top face lip
    d.polygon([(WX1,WY_TOP),(WX2,WY_TOP),(WX2+6,WY_TOP+8),(WX1+6,WY_TOP+8)],
              fill=ST_LT)
    # front face
    d.rectangle([WX1, WALL_TOP, WX2, WY_BOT], fill=ST_MID)
    draw_stone_blocks(d, WX1, WALL_TOP, WX2, WY_BOT, ST_MID, MORTAR, 12, 30)
    # side face (right edge)
    d.polygon([(WX2,WALL_TOP),(WX2+6,WY_TOP+8),(WX2+6,WY_BOT),(WX2,WY_BOT)],
              fill=ST_DK)

    # ── battlements on main wall ─────────────────────────────────────────────
    MW  = 14   # merlon width
    CW  = 10   # crenel width
    MH  = 18   # merlon height above WY_TOP
    bx  = WX1 + 6
    while bx + MW <= WX2 - 4:
        mx1, mx2 = bx, bx + MW
        my_top   = WY_TOP - MH
        # 3-D top face
        d.polygon([(mx1,my_top),(mx2,my_top),(mx2+5,my_top+6),(mx1+5,my_top+6)],
                  fill=ST_HI)
        # front face
        d.rectangle([mx1, my_top+6, mx2, WY_TOP+2], fill=ST_MID)
        # top highlight
        d.line([(mx1,my_top),(mx2,my_top)], fill=ST_TOP, width=2)
        # mortar outline
        d.rectangle([mx1,my_top+6, mx2, WY_TOP+2], outline=MORTAR)
        bx += MW + CW

    # ── left tower ───────────────────────────────────────────────────────────
    # top face
    d.polygon([(TX1,TY_TOP),(TX2,TY_TOP),(TX2+8,TY_TOP+10),(TX1+8,TY_TOP+10)],
              fill=ST_LT)
    # front face
    d.rectangle([TX1, TY_TOP+10, TX2, TY_BOT], fill=ST_DK)
    draw_stone_blocks(d, TX1, TY_TOP+10, TX2, TY_BOT, ST_DK, MORTAR, 11, 22)
    # right side face (darker)
    d.polygon([(TX2,TY_TOP+10),(TX2+8,TY_TOP+10),(TX2+8,TY_BOT),(TX2,TY_BOT)],
              fill=(32,32,46,255))

    # tower battlements
    tbx = TX1
    TMH = 14
    while tbx + 9 <= TX2:
        my_top = TY_TOP - TMH
        # top face
        d.polygon([(tbx,my_top),(tbx+9,my_top),(tbx+12,my_top+6),(tbx+3,my_top+6)],
                  fill=ST_HI)
        d.rectangle([tbx,my_top+6, tbx+9, TY_TOP+2], fill=ST_DK)
        d.line([(tbx,my_top),(tbx+9,my_top)], fill=ST_TOP, width=2)
        d.rectangle([tbx,my_top+6, tbx+9, TY_TOP+2], outline=MORTAR)
        tbx += 15

    # tower arrow-slit
    sl_cx = (TX1+TX2)//2
    sl_y  = TY_TOP + 40
    d.rectangle([sl_cx-3, sl_y, sl_cx+3, sl_y+18], fill=(15,15,25,255))
    d.rectangle([sl_cx-6, sl_y+5, sl_cx+6, sl_y+12], fill=(15,15,25,255))

    # second slit lower
    sl_y2 = TY_TOP + 78
    d.rectangle([sl_cx-3, sl_y2, sl_cx+3, sl_y2+16], fill=(15,15,25,255))

    # ── war banner on tower ──────────────────────────────────────────────────
    fp_x = TX1 + 28
    fp_y_bot = TY_TOP - 4
    fp_y_top = fp_y_bot - 32
    # flagpole
    d.line([(fp_x, fp_y_bot), (fp_x, fp_y_top)], fill=MET_MID, width=2)
    # flag
    flag = [(fp_x, fp_y_top),
            (fp_x+28, fp_y_top+7),
            (fp_x+28, fp_y_top+21),
            (fp_x, fp_y_top+26)]
    d.polygon(flag, fill=BAN_RED)
    d.line([flag[1], flag[2]], fill=BAN_DK, width=1)
    d.line([flag[0], flag[3]], fill=BAN_DK, width=1)
    # ⚔ cross-sword icon on flag
    fx, fy = fp_x+14, fp_y_top+13
    d.rectangle([fx-2, fy-9, fx+2, fy+9], fill=SNW_HI)
    d.rectangle([fx-7, fy-2, fx+7, fy+2], fill=SNW_HI)
    # tiny sword tips
    d.rectangle([fx-2, fy-11, fx+2, fy-9], fill=ICE_MID)
    d.rectangle([fx-9, fy-2, fx-7, fy+2], fill=ICE_MID)

    # ── gate ─────────────────────────────────────────────────────────────────
    arch_h = 24
    # arch background
    d.ellipse([GX1, GY1-arch_h//2, GX2, GY1+arch_h], fill=(15,12,8,255))
    d.rectangle([GX1, GY1+arch_h//2, GX2, GY2], fill=(15,12,8,255))
    # stone surround
    d.rectangle([GX1-6, GY1, GX1, GY2], fill=ST_DK)
    d.rectangle([GX2, GY1, GX2+6, GY2], fill=ST_DK)
    d.line([(GX1-6,GY1),(GX2+6,GY1)], fill=ST_MID, width=3)
    # portcullis bars
    bar_top = GY1 + arch_h//2
    for bvx in range(GX1+4, GX2-2, 7):
        d.line([(bvx, bar_top), (bvx, GY2)], fill=IRON, width=2)
    for bhy in range(bar_top+8, GY2, 10):
        d.line([(GX1+4, bhy), (GX2-4, bhy)], fill=IRON, width=2)

    # ── arrow slits on main wall ─────────────────────────────────────────────
    for slx in [WX1+20, WX2-22]:
        sly = WALL_TOP + 25
        d.rectangle([slx-3, sly, slx+3, sly+16], fill=(15,15,25,255))
        d.rectangle([slx-6, sly+4, slx+6, sly+10], fill=(15,15,25,255))

    # ── cannon platform ──────────────────────────────────────────────────────
    # platform top face
    d.polygon([(PL_X1,PL_Y1),(PL_X2,PL_Y1),(PL_X2+5,PL_Y1+6),(PL_X1+5,PL_Y1+6)],
              fill=MET_LT)
    # platform front
    d.rectangle([PL_X1, PL_Y1+6, PL_X2, PL_Y2], fill=MET_MID)
    d.line([(PL_X1,PL_Y2),(PL_X2,PL_Y2)], fill=MET_DK, width=2)
    # wheels
    wy = PL_Y2 + 8
    for wxp in [PL_X1+10, PL_X2-14]:
        d.ellipse([wxp-9,wy-9,wxp+9,wy+9], fill=MET_DK, outline=MET_LT)
        d.ellipse([wxp-4,wy-4,wxp+4,wy+4], fill=MET_MID)
        d.line([(wxp,wy-8),(wxp,wy+8)], fill=MET_LT, width=1)
        d.line([(wxp-8,wy),(wxp+8,wy)], fill=MET_LT, width=1)
        d.line([(wxp-6,wy-6),(wxp+6,wy+6)], fill=MET_LT, width=1)
        d.line([(wxp+6,wy-6),(wxp-6,wy+6)], fill=MET_LT, width=1)

    # ── ice cannon ───────────────────────────────────────────────────────────
    CY      = PL_Y1 + 4      # vertical center of barrel
    BRX1    = PL_X1 + 14     # barrel start x
    BRX2    = 248             # barrel end x (extends past tile edge a bit)
    BRY_T   = CY - 7
    BRY_B   = CY + 7

    # breech (round end)
    d.ellipse([PL_X1+2, CY-12, PL_X1+28, CY+12], fill=ICE_MID)
    d.ellipse([PL_X1+6, CY-8,  PL_X1+22, CY+8],  fill=ICE_HI)

    # barrel body
    d.polygon([(BRX1,BRY_T-1),(BRX2,BRY_T+1),(BRX2,BRY_B-1),(BRX1,BRY_B+1)],
              fill=ICE_DK)
    # frost highlight along top
    d.polygon([(BRX1,BRY_T-1),(BRX2,BRY_T+1),(BRX2,BRY_T+3),(BRX1,BRY_T+1)],
              fill=ICE_HI)
    # rings
    for rx in range(BRX1+16, BRX2-4, 20):
        d.rectangle([rx,BRY_T,rx+4,BRY_B], fill=ICE_SHD)
        d.line([(rx+1,BRY_T),(rx+1,BRY_B)], fill=ICE_MID, width=1)
    # muzzle
    d.ellipse([BRX2-7, BRY_T-1, BRX2+3, BRY_B+1], fill=ICE_SHD)
    d.ellipse([BRX2-5, BRY_T+1, BRX2+1, BRY_B-1], fill=(5,5,20,255))

    # ice crystals on breech
    for (cx_, cy_) in [(PL_X1+6, CY-16), (PL_X1+17, CY-18), (PL_X1+28, CY-14)]:
        pts = [(cx_, cy_-7),(cx_-3,cy_),(cx_,cy_+5),(cx_+3,cy_)]
        d.polygon(pts, fill=ICE_HI)
        d.polygon(pts, outline=ICE_MID)

    # ── snow overlay ─────────────────────────────────────────────────────────
    if snow > 0:
        sn = Image.new('RGBA', (TILE,TILE), (0,0,0,0))
        snd = ImageDraw.Draw(sn)
        a = int(255 * snow)

        def sc(col, alpha_override=None):
            return (*col[:3], alpha_override if alpha_override is not None else a)

        # Snow on main wall battlements
        bx2 = WX1 + 6
        while bx2 + MW <= WX2 - 4:
            snd.rectangle([bx2, WY_TOP-MH, bx2+MW, WY_TOP-MH+6], fill=sc(SNW_HI))
            bx2 += MW + CW

        # Snow bank on top of main wall
        snd.polygon([(WX1,WALL_TOP-2),(WX2,WALL_TOP-2),(WX2,WALL_TOP+8),(WX1,WALL_TOP+8)],
                    fill=sc(SNW_MID))
        # Snow on top lip
        snd.polygon([(WX1,WY_TOP),(WX2,WY_TOP),(WX2+6,WY_TOP+8),(WX1+6,WY_TOP+8)],
                    fill=sc(SNW_HI, int(a*0.7)))

        # Snow on tower battlements
        tbx2 = TX1
        while tbx2 + 9 <= TX2:
            snd.rectangle([tbx2, TY_TOP-TMH, tbx2+9, TY_TOP-TMH+5], fill=sc(SNW_HI))
            tbx2 += 15

        # Snow cap on tower
        snd.polygon([(TX1,TY_TOP),(TX2,TY_TOP),(TX2+8,TY_TOP+10),(TX1+8,TY_TOP+10)],
                    fill=sc(SNW_MID, int(a*0.8)))

        # Snow on cannon barrel
        snd.polygon([(BRX1,BRY_T-1),(BRX2,BRY_T+1),(BRX2,BRY_T+5),(BRX1,BRY_T+3)],
                    fill=sc(SNW_HI))

        # Snow on platform
        snd.polygon([(PL_X1,PL_Y1),(PL_X2,PL_Y1),(PL_X2+5,PL_Y1+6),(PL_X1+5,PL_Y1+6)],
                    fill=sc(SNW_MID))

        # Snow blobs on gate arch
        snd.ellipse([GX1-4, GY1-10, GX2+4, GY1+8], fill=sc(SNW_MID, int(a*0.9)))

        # Right block snow
        snd.polygon([(RBX1,RBY_TOP),(RBX2,RBY_TOP),(RBX2+6,RBY_TOP+8),(RBX1+6,RBY_TOP+8)],
                    fill=sc(SNW_MID, int(a*0.75)))

        img = composite(img, sn)

    return img


# ── load background grids ────────────────────────────────────────────────────

grass_s = load(f'{ASSETS}/tiles256/grass-summer.png')
grass_w = load(f'{ASSETS}/tiles256/grass-winter.png')
grass_t = load(f'{ASSETS}/tiles-transition256/grass-transition-winter-to-summer-grid.png')

out_dir = f'{ASSETS}/tiles256'
out_tr  = f'{ASSETS}/tiles-transition256'

# ── summer ───────────────────────────────────────────────────────────────────

summer = draw_building(grass_s, snow=0.0)
summer.save(f'{out_dir}/war-factory-summer.png')
print('✓ war-factory-summer.png')

# ── winter ───────────────────────────────────────────────────────────────────

winter = draw_building(grass_w, snow=1.0)
winter.save(f'{out_dir}/war-factory-winter.png')
print('✓ war-factory-winter.png')

# ── transition grid (3×3, 768×768) ──────────────────────────────────────────
# Row 0: full winter (frames 0-2)
# Row 1: half-transition (frames 3-5)
# Row 2: full summer (frames 6-8)
# Snow amounts per cell: row0→1.0, row1→0.5, row2→0.0

grid = Image.new('RGBA', (TILE*3, TILE*3))

snow_levels = [
    [1.0, 1.0, 0.85],   # row 0 (winter)
    [0.65, 0.45, 0.25],  # row 1 (mid)
    [0.12, 0.05, 0.0],   # row 2 (summer)
]

for row in range(3):
    for col in range(3):
        # Use the matching background frame from the grass transition grid
        bg = get_frame(grass_t, row, col)
        frame = draw_building(bg, snow=snow_levels[row][col])
        grid.paste(frame, (col*TILE, row*TILE))

grid.save(f'{out_tr}/war-factory-transition-winter-to-summer-grid.png')
print('✓ war-factory-transition-winter-to-summer-grid.png')

print('\nAll war factory tiles generated successfully.')
