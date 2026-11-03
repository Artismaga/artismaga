import argparse
from pathlib import Path
import tarfile,re,json
parser=argparse.ArgumentParser(description='Regenerate pinned Twemoji PNG assets and search index from a reviewed archive and Unicode emoji-test file.')
parser.add_argument('archive')
parser.add_argument('emoji_test')
args=parser.parse_args()
root=Path('crates/web/assets/reactions');root.mkdir(exist_ok=True)
with tarfile.open(args.archive) as archive:
 for member in archive.getmembers():
  if '/assets/72x72/' in member.name and member.isfile() and member.name.endswith('.png'):
   name=Path(member.name).name
   if re.fullmatch('[a-f0-9-]+.png',name): (root/name).write_bytes(archive.extractfile(member).read())
names={}
categories={}
order={}
group="Symbols"
rank=0
for line in Path(args.emoji_test).read_text().splitlines():
 if line.startswith('# group: '): group=line.removeprefix('# group: ')
 m=re.match(r'^([A-F0-9 ]+)\s*;[^#]+#\s*(\S+)\s+E[0-9.]+\s+(.+)$',line)
 if m:
  code='-'.join(v.lower().lstrip('0') or '0' for v in m[1].split());names[code]=m[3]
  names.setdefault(code.replace('-fe0f',''),m[3])
  for key in [code,code.replace('-fe0f','')]:
   categories.setdefault(key,group);order.setdefault(key,rank)
  rank+=1
files=sorted(p.stem for p in root.glob('*.png'))
Path('crates/studio/src/twemoji.txt').write_text('\n'.join(files)+'\n')
Path('crates/web/src/reaction_assets.rs').write_text('// Generated fixed Twemoji v17.0.3 assets; no caller filesystem paths.\npub fn image(name:&str)->Option<&\'static [u8]>{Some(match name {\n'+''.join(f'"{code}.png"=>include_bytes!("../assets/reactions/{code}.png"),\n' for code in files)+'_=>return None,\n})}\n')
Path('web/src/shared/twemoji.json').write_text(json.dumps([{'code':code,'name':names.get(code,'Emoji '+code),'category':categories.get(code,'Symbols')} for code in sorted(files,key=lambda code:order.get(code,100000))],ensure_ascii=False,separators=(',',':'))+'\n')
print(len(files),'bundled emoji')
