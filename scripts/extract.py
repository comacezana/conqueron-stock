import re,json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
x=z.read('word/document.xml').decode('utf8')
out=[]
for r in re.findall(r'<w:tr[ >].*?</w:tr>',x,re.S):
    c=[''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>',t)) for t in re.findall(r'<w:tc>.*?</w:tc>',r,re.S)]
    if c and c[0].isdigit():
        out.append(dict(sn=int(c[0]),name=c[1],sku=c[2],dimension=c[3],qty=int(float(c[4].replace(',',''))),uom=c[5]))
assert len(out)==56 and len({o['sku'] for o in out})==56
json.dump(out,open('data/catalog.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
print(len(out))
