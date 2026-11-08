#!/usr/bin/env python3
"""OpenAPI JSON ni Jackson DefaultPrettyPrinter formatida yozadi (qo'lda tahrirlangan openapi.json diff'i kichik bo'lishi uchun).
Foydalanish: python3 scripts/openapi-jackson-format.py <fayl>  — tekshiradi; modul sifatida dump(d)."""
import json,sys
def enc(v,ind):
    sp='  '*ind
    if isinstance(v,dict):
        if not v: return '{ }'
        items=[f'{sp}  {json.dumps(k,ensure_ascii=False)} : {enc(x,ind+1)}' for k,x in v.items()]
        return '{\n'+',\n'.join(items)+'\n'+sp+'}'
    if isinstance(v,list):
        if not v: return '[ ]'
        return '[ '+', '.join(enc(x,ind) for x in v)+' ]'
    return json.dumps(v,ensure_ascii=False)
def dump(d): return enc(d,0)
if __name__=='__main__':
    raw=open(sys.argv[1]).read()
    out=dump(json.loads(raw))
    print(out==raw.rstrip('\n'), len(out), len(raw))
