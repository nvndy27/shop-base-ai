#!/usr/bin/env python3
"""Local-only index/key setup. No database seed or production deployment."""
import base64,json,pathlib,ssl,urllib.request,urllib.error,os,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/amazon-2023'
INDEX='shopbase-marketplace-v1'
def main():
 context=ssl.create_default_context(cafile=str(DATA/'elasticsearch-ca.crt'))
 admin='Basic '+base64.b64encode(('elastic:'+(DATA/'.elasticsearch.password').read_text().strip()).encode()).decode()
 def call(path,body=None,method='POST',authorization=admin):
  req=urllib.request.Request('https://localhost:9200'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':authorization,'Content-Type':'application/json'},method=method)
  with urllib.request.urlopen(req,context=context,timeout=15) as response:return json.load(response)
 try: mapping=call('/'+INDEX+'/_mapping',method='GET')
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  call('/'+INDEX,{'settings':{'number_of_shards':1,'number_of_replicas':0,'analysis':{'analyzer':{'folded':{'type':'custom','tokenizer':'standard','filter':['lowercase','asciifolding']}}}},
   'mappings':{'dynamic':'strict','_meta':{'course_marketplace':1},'properties':{'id':{'type':'keyword'},'visible':{'type':'boolean'},'title':{'type':'text','analyzer':'folded'},'description':{'type':'text','analyzer':'folded'},'category':{'type':'keyword'},'price':{'type':'long'}}}},method='PUT')
  mapping=call('/'+INDEX+'/_mapping',method='GET')
 if mapping[INDEX]['mappings'].get('_meta',{}).get('course_marketplace')!=1:raise RuntimeError('Incompatible index')
 paths={}
 for kind,privileges in [('search',['read']),('worker',['write'])]:
  path=DATA/('.marketplace-'+kind+'.key')
  if not path.exists():
   result=call('/_security/api_key',{'name':'shopbase-marketplace-'+kind,'role_descriptors':{kind:{'cluster':[],'indices':[{'names':[INDEX],'privileges':privileges}]}}})
   fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'w') as output:output.write(result['encoded']+'\n')
  granted=call('/_security/user/_has_privileges',{'index':[{'names':[INDEX],'privileges':['read','write','delete_index']}]},authorization='ApiKey '+path.read_text().strip())['index'][INDEX]
  if granted['delete_index'] or granted['read']!=(kind=='search') or granted['write']!=(kind=='worker'):raise RuntimeError('Unexpected privileges')
  paths[kind]=path
 settings={'ELASTIC_URL':'https://localhost:9200','ELASTIC_CA_FILE':str(DATA/'elasticsearch-ca.crt'),'ELASTIC_MARKETPLACE_SEARCH_KEY_FILE':str(paths['search']),'ELASTIC_MARKETPLACE_WORKER_KEY_FILE':str(paths['worker'])}
 env=ROOT/'apps/web/.env.local'
 lines=[line for line in env.read_text().splitlines() if line.split('=',1)[0] not in settings]
 env.write_text('\n'.join(lines)+'\n'+''.join(k+'='+v+'\n' for k,v in settings.items()))
 print('Local marketplace index ready. Separate read/write keys; no cluster or delete-index permission.')
try:main()
except Exception:
 print('Local index setup failed. Check Docker, TLS files and local credentials.',file=sys.stderr);sys.exit(1)
