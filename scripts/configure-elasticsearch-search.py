#!/usr/bin/env python3
"""Create a read-only API key for the imported local index. Never print credentials."""
import base64,json,pathlib,ssl,urllib.request,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/amazon-2023'
context=ssl.create_default_context(cafile=str(DATA/'elasticsearch-ca.crt'))
password=(DATA/'.elasticsearch.password').read_text().strip()
auth='Basic '+base64.b64encode(('elastic:'+password).encode()).decode()
def call(path,body,authorization=auth):
 req=urllib.request.Request('https://localhost:9200'+path,data=json.dumps(body).encode(),headers={'Authorization':authorization,'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,context=context,timeout=15) as response:return json.load(response)
key_file=DATA/'.elasticsearch-search.key'
if not key_file.exists():
 result=call('/_security/api_key',{'name':'shopbase-catalog-read','role_descriptors':{'catalog_read':{'cluster':[],'indices':[{'names':['shopbase-amazon-catalog','shopbase-amazon-0dac845f97a1'],'privileges':['read']}]}}})
 fd=os.open(key_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as output:output.write(result['encoded']+'\n')
key=key_file.read_text().strip()
result=call('/shopbase-amazon-catalog/_search',{'size':0,'track_total_hits':True,'query':{'match_all':{}}},'ApiKey '+key)
if result['hits']['total']['value']!=20000:raise RuntimeError('Unexpected catalog size')
# Verify that this credential cannot write, using the non-mutating privilege inspection API.
privileges=call('/_security/user/_has_privileges',{'index':[{'names':['shopbase-amazon-catalog'],'privileges':['read','write']}]},'ApiKey '+key)
access=privileges['index']['shopbase-amazon-catalog']
if not access['read'] or access['write']:raise RuntimeError('Unexpected search key privileges')
env_file=ROOT/'apps/web/.env.local'
text=env_file.read_text()
settings={'ELASTIC_URL':'https://localhost:9200','ELASTIC_SEARCH_KEY_FILE':str(key_file),'ELASTIC_CA_FILE':str(DATA/'elasticsearch-ca.crt')}
lines=[line for line in text.splitlines() if line.split('=',1)[0] not in settings]
env_file.write_text('\n'.join(lines)+'\n'+''.join(k+'='+v+'\n' for k,v in settings.items()))
print('Configured local TLS search key: read allowed, write denied; 20000 indexed products.')
