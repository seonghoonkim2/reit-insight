#!/usr/bin/env python3
"""Change only A&R C79 in the downloaded five-year file; independently recalculate."""
import json,math,sys,warnings
from pathlib import Path
import formulas
from workbook_cache import ERRORS,solution_values,verify_formula_caches,lease_group_inputs
warnings.filterwarnings('ignore',category=FutureWarning)
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent/'out'/'editable-hold'
checks=0
def near(a,b,label):
    global checks
    checks+=1
    if b is None or b=='': assert a=='', (label,a,b)
    else: assert math.isclose(float(a),float(b),rel_tol=1e-7,abs_tol=1e-7),(label,a,b)
configs=json.loads((root/'expected.json').read_text(encoding='utf-8'))
if len(sys.argv)>2: configs=[c for c in configs if c['name']==sys.argv[2]]
for config in configs:
    source=root/(config['name']+'.xlsx')
    model=formulas.ExcelModel().loads(str(source)).finish()
    baseline=model.calculate()
    cache=verify_formula_caches(str(source),baseline)
    assert not cache['errors'],cache['errors'][:10]
    checks+=cache['count']
    key=next(k for k in model.dsp.data_nodes if k.endswith("]A&R'!C79"))
    for hold,e in config['expected'].items():
        hold=int(hold);r=e['raw'];v=solution_values(model.calculate(inputs={key:hold}))
        errors=[(k,x) for k,x in v.items() if str(x) in ERRORS]
        assert not errors,(config['name'],hold,errors[:10])
        checks+=len(v)
        for ref,field in [('J5','IRR'),('J6','IRRat'),('J7','EM'),('H5','commonIRR'),('I5','prefIRR'),('H7','commonEM'),('I7','prefEM'),('H8','commonCoC'),('H12','unlev'),('H13','minDSCR')]:
            near(v['A&R!'+ref],r[field],(config['name'],hold,field))
        near(v['세무·매각!C15'],r['netSale'],'sale')
        for y in range(1,11):
            c=chr(66+y);ec=chr(67+y)
            for sheet,row,field in [('대출',8,'endBal'),('대출',20,'mezzEnd'),('대출',9,'DS'),('지분 현금흐름',7,'dist')]:
                near(v[f'{sheet}!{ec if sheet=="지분 현금흐름" else c}{row}'],r[field][y-1] if y<=hold else '',(hold,sheet,row,y))
        for ref,value in e['sensitivity'].items():near(v['A&R!'+ref],value,('sensitivity',hold,ref))
        for row in (27,28,29,30):assert v[f'검증!E{row}']=='PASS',(config['name'],hold,row,v[f'검증!E{row}'])
        print('PASS:',config['name'],'5 ->',hold,flush=True)
    if config['name']=='office':
        for invalid in (0,2,11,5.5,'bad'):
            v=solution_values(model.calculate(inputs={key:invalid}))
            errors=[(k,x) for k,x in v.items() if str(x) in ERRORS]
            assert not errors,(invalid,errors[:10])
            assert v['검증!E30']=='FAIL' and v['검증!E15']=='FAIL',(invalid,v['검증!E30'])
            assert v['A&R!J5']=='' and v['A&R!J7']=='',(invalid,'stale returns')
            checks+=len(v)
if len(sys.argv)<3 or sys.argv[2]=='lease':
    source=root/'fixed-lease.xlsx'
    model=formulas.ExcelModel().loads(str(source)).finish()
    baseline=model.calculate();grouped=lease_group_inputs(str(source),baseline)
    baseline=model.calculate(inputs=grouped)
    cache=verify_formula_caches(str(source),baseline)
    assert not cache['errors'],cache['errors'][:10]
    checks+=cache['count']
    key=next(k for k in model.dsp.data_nodes if k.endswith("]A&R'!C79"))
    before=solution_values(baseline)
    for changed in (3,7,5.5,'bad',''):
        v=solution_values(model.calculate(inputs={**grouped,key:changed}))
        assert not [(k,x) for k,x in v.items() if str(x) in ERRORS],changed
        for ref in ['A&R!C57','A&R!J5','A&R!J7','A&R!J51','A&R!J58','A&R!J61','운영수지!C18','지분 현금흐름!H7']:
            assert v[ref]=='',(changed,ref,v[ref])
        assert v['검증!E30']=='FAIL' and v['검증!E15']=='FAIL',changed
        assert '중단' in v['A&R!G67'],changed
        checks+=len(v)
        print('PASS: fixed lease rejects',repr(changed),flush=True)
    restored=solution_values(model.calculate(inputs={**grouped,key:5}))
    for ref in ['A&R!C57','A&R!J5','A&R!J7','A&R!J61','운영수지!C18','지분 현금흐름!H7']:
        near(restored[ref],before[ref],('lease restored',ref))
    assert restored['검증!E30']=='PASS'
    print('PASS: fixed lease restored to original period',flush=True)
print('PASS:',checks,'cache/recalculation comparisons;',len(configs)*4,'period edits')
