#!/usr/bin/env python3
"""Independent Excel recalculation after editing the development schedule inputs."""
import argparse,json,math,re
from pathlib import Path
import formulas
from workbook_cache import verify_formula_caches,solution_values
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dir',type=Path,default=Path(__file__).parent/'out/input-contract')
args=parser.parse_args();file=args.dir/'dev-after-completion.xlsx'
model=formulas.ExcelModel().loads(str(file.resolve())).finish();base=model.calculate();values=solution_values(base)
checks=[]
def check(label,condition):
    checks.append({'name':label,'passed':bool(condition)})
    if not condition:raise AssertionError(label)
cache=verify_formula_caches(file,base)
check('all formula caches independently agree',not cache['errors'])
check('all contracted revenue collected after completion',math.isclose(values['04_PROFITABILITY!C5'],1200,abs_tol=1e-8))
check('no earlier contract receipts',all(values['03_MONTHLY_CF!G'+str(r)]==0 for r in range(5,25)))
keys={}
for key in base:
    m=re.search(r"\]((?:[^']|'')+)'!([A-Z]+\d+)$",key,re.I)
    if m:keys[m[1].replace("''","'").upper()+'!'+m[2].upper()]=key
for bad in [-1,1.5,121,'invalid','']:
    got=solution_values(model.calculate(inputs={keys['01_ASSUMPTIONS!C37']:bad}))
    check('invalid land payment '+str(bad)+' suppresses summary',all(got['04_PROFITABILITY!'+c]=='' for c in ['C5','C16','C21','C28','C29','C30']))
    check('invalid land payment '+str(bad)+' explains supported range','0~120' in got['01_ASSUMPTIONS!F37'])
    check('invalid land payment '+str(bad)+' contains no formula errors',not any(str(v).startswith(('#REF!','#VALUE!','#DIV/0!','#NUM!','#NAME?')) for v in got.values()))
for good in [0,120]:
    got=solution_values(model.calculate(inputs={keys['01_ASSUMPTIONS!C37']:good}))
    check('valid land payment '+str(good)+' recalculates summary',isinstance(got['04_PROFITABILITY!C21'],(int,float)))
    check('valid land payment '+str(good)+' pays all land cost',math.isclose(sum(got['03_MONTHLY_CF!H'+str(r)] for r in range(5,32)),250,abs_tol=1e-8))
(args.dir/'recalculation.json').write_text(json.dumps({'checks':checks,'formulaCaches':cache['count']},ensure_ascii=False,indent=2),encoding='utf8')
print('INPUT CONTRACT EXCEL OK - '+str(len(checks))+' checks, '+str(cache['count'])+' formula caches')
