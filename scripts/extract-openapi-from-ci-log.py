import re,sys
lines=open(sys.argv[1],encoding='utf-8').read().splitlines()
out=[];on=False
for l in lines:
    m=re.match(r'^[^\t]*\t[^\t]*\t\S+Z (.*)$',l)
    if not m: continue
    body=m.group(1)
    if body.startswith('----- OPENAPI BEGIN'): on=True; continue
    if body.startswith('----- OPENAPI END'): break
    if on: out.append(body)
if not out: sys.exit("spec topilmadi")
open(sys.argv[2],'w').write('\n'.join(out)+'\n')
print("ok", len(out))
