#!/usr/bin/env python3
"""Recalculate edited development models; independent revenue and cost ledgers."""
import argparse,json,math,re
from pathlib import Path
import formulas,openpyxl
from workbook_cache import verify_formula_caches,solution_values

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dir',type=Path,default=Path(__file__).parent/'out/dev-model')
args=parser.parse_args();manifest=json.loads((args.dir/'manifest.json').read_text(encoding='utf8'))
checks=[]
def check(name,condition,detail=None):
    checks.append({'name':name,'passed':bool(condition),'detail':detail})
    if not condition:print('FAIL',name,detail)
def near(a,b):return isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-7)
for case in manifest['cases']:
    file=args.dir/case['file'];model=formulas.ExcelModel().loads(str(file.resolve())).finish();base=model.calculate();values=solution_values(base)
    caches=verify_formula_caches(file,base);check(case['name']+' caches independently recalculated',not caches['errors'],{'count':caches['count'],'errors':caches['errors']})
    check(case['name']+' all contracted consideration collected',near(values['04_PROFITABILITY!C5'],1200),values['04_PROFITABILITY!C5'])
    check(case['name']+' hard costs equal 250 land + 500 construction + 20 other',near(values['04_PROFITABILITY!C9']+values['04_PROFITABILITY!C10']+values['04_PROFITABILITY!C11'],770))
    check(case['name']+' conversion-month interest belongs to bridge interval',near(values['03_MONTHLY_CF!N7'],(250+40/15-100)*.12/12),values['03_MONTHLY_CF!N7'])
    check(case['name']+' interest, fee and profit reconcile',near(values['04_PROFITABILITY!C21'],1200-770-values['04_PROFITABILITY!C14']-values['04_PROFITABILITY!C17']))
    for metric,ref in [('IRR','C29'),('EM','C28'),('loan','C16'),('profit','C21')]:check(case['name']+' screen '+metric,near(values['04_PROFITABILITY!'+ref],case['expected'][metric]))
    if case['count']!=6:continue
    keys={}
    for key in base:
        m=re.search(r"\]((?:[^']|'')+)'!([A-Z]+\d+)$",key,re.I)
        if m:keys[m[1].replace("''","'").upper()+'!'+m[2].upper()]=key
    def edited(changes):return solution_values(model.calculate(inputs={keys[k.upper()]:v for k,v in changes.items()}))
    sensitivity=['05_SENSITIVITY!'+c+str(r) for c in 'CDEFG' for r in range(5,9)]
    for count in (1,4,8,12):
        got=edited({'01_Assumptions!C19':count})
        check('edit to '+str(count)+' instalments preserves 1200 revenue',near(got['04_PROFITABILITY!C5'],1200),got['04_PROFITABILITY!C5'])
        check('edit to '+str(count)+' instalments collects exactly 60% mid payments',near(sum(got['03_MONTHLY_CF!E'+str(r)] for r in range(5,20)),720))
        check('count edit hides all snapshot sensitivity values',all(got[r]=='' for r in sensitivity))
    for count in (0,13,2.5,'invalid'):
        got=edited({'01_Assumptions!C19':count})
        check('invalid count '+str(count)+' hides returns',got['04_PROFITABILITY!C29']=='')
        check('invalid count '+str(count)+' explains constraint','회차 오류' in str(got['01_ASSUMPTIONS!F19']))
        check('invalid count '+str(count)+' has no formula errors',not any(str(v).startswith(('#REF!','#VALUE!','#DIV/0!','#NUM!','#NAME?')) for v in got.values()))
    for ref,value in [('C10',18),('C11',1),('C12',18),('C13',4)]:
        got=edited({'01_Assumptions!'+ref:value})
        check('schedule edit '+ref+' hides unsupported summary',all(got['04_PROFITABILITY!'+r]=='' for r in ('C5','C16','C18','C21','C22','C28','C29')))
        check('schedule edit '+ref+' has redownload notice','다시 받으세요' in got['04_PROFITABILITY!B31'])
        check('schedule edit '+ref+' hides sensitivity',all(got[r]=='' for r in sensitivity))
    for ref,value in [('01_Assumptions!C5',275),('01_Assumptions!C26',2),('02_Unit_Mix!E5',18)]:
        got=edited({ref:value})
        check('changed financial assumption hides sensitivity '+ref,all(got[r]=='' for r in sensitivity))
        check('ordinary financial assumption still updates returns '+ref,isinstance(got['04_PROFITABILITY!C29'],(int,float)) and not near(got['04_PROFITABILITY!C29'],values['04_PROFITABILITY!C29']))
    loss=edited({'01_Assumptions!C15':10})
    check('negative equity recovery has no annualized IRR',loss['04_PROFITABILITY!C27']<0 and loss['04_PROFITABILITY!C29']=='')
    loss65=edited({'01_Assumptions!C15':65,'01_Assumptions!C6':700})
    check('65 percent sales has zero distribution multiple',near(loss65['04_PROFITABILITY!C28'],0))
    check('65 percent sales preserves signed recovery and no IRR',loss65['04_PROFITABILITY!C27']<0 and loss65['04_PROFITABILITY!C29']=='')
    check('65 percent sales reconciles funding shortfall',loss65['04_PROFITABILITY!C30']>0 and near(loss65['04_PROFITABILITY!C30'],loss65['04_PROFITABILITY!C26']+loss65['04_PROFITABILITY!C17']-loss65['04_PROFITABILITY!C25']))
    late=edited({'01_Assumptions!C37':100})
    check('late land payment still pays all 250 land cost',near(sum(late['03_MONTHLY_CF!H'+str(r)] for r in range(5,20)),250))
    check('late land payment is applied at last month',near(late['03_MONTHLY_CF!H19'],225))
    check('late land payment does not inflate equity recovery',near(late['04_PROFITABILITY!C27'],100+late['04_PROFITABILITY!C21']))
    check('late land payment states the timing assumption','종료월' in late['01_ASSUMPTIONS!F37'])
    restored=edited({'01_Assumptions!C5':250})
    check('restoring original assumption restores sensitivity',all(near(restored[r],values[r]) for r in sensitivity))
report={'checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}
(args.dir/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf8')
print('DEV MODEL '+('OK' if not report['failed'] else 'FAIL')+' - '+str(report['passed'])+' passed, '+str(report['failed'])+' failed')
raise SystemExit(1 if report['failed'] else 0)
