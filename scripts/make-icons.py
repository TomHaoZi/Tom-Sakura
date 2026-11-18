"""Regenerate the original Tom Sakura icon (developer-only: pip install Pillow)."""
from pathlib import Path
from math import sin, cos, pi
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / 'assets'
ROOT.mkdir(exist_ok=True)
SIZE = 1024
base = Image.new('RGBA', (SIZE, SIZE))
ImageDraw.Draw(base).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=230, fill='#15161e')
petals = Image.new('RGBA', (SIZE, SIZE))
draw = ImageDraw.Draw(petals)

def curve(a, b, c, d):
    return [tuple((1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i] for i in (0,1)) for t in [n/30 for n in range(31)]]

outline = curve((20,21), (8,17), (10,4), (16,3)) + [(20,7), (24,3)] + curve((24,3), (30,4), (32,17), (20,21))
for n in range(5):
    angle = n * 2*pi/5
    points = []
    for x,y in outline:
        x,y = (x-20)*21, (y-20)*21
        points.append((SIZE/2 + x*cos(angle)-y*sin(angle), SIZE/2 + x*sin(angle)+y*cos(angle)))
    draw.polygon(points, fill=['#f58aa4','#ec7397','#ef7899','#fa9db0','#ffafbe'][n])
glow = petals.filter(ImageFilter.GaussianBlur(34))
glow.putalpha(glow.getchannel('A').point(lambda v: v//4))
base = Image.alpha_composite(Image.alpha_composite(base, glow), petals)
ImageDraw.Draw(base).ellipse((SIZE/2-45,SIZE/2-45,SIZE/2+45,SIZE/2+45), fill='#fff0f4')
base = base.resize((512,512), Image.Resampling.LANCZOS)
base.save(ROOT / 'icon.png')
base.save(ROOT / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Created assets/icon.png and assets/icon.ico')
