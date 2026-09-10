'use strict';
const MEMBERS = ['BOSS L', 'BOSS W', 'BOSS K'];
const STATUSES = ['未支付', '已支付'];
function migrateStatuses(data) { return Array.isArray(data) ? data.map(r => { if (!r) return r; let record = r; if (['待审核','已批准','已拒绝'].includes(record.status)) record = {...record,status:'未支付'}; if (record.member === 'BOOS L') record = {...record,member:'BOSS L'}; return record; }) : data; }
let currentMember = null;
const STORAGE_KEY = 'company-claims-v1';
const $ = id => document.getElementById(id);
let attachments = [], readingFiles = false, previewUrl = null;
let records = [], editingId = null, deletingId = null, storageReady = false;
const money = cents => (cents / 100).toLocaleString('en-MY', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function notify(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function validRecord(r) { return r && typeof r.id === 'string' && typeof r.name === 'string' && Number.isSafeInteger(r.amount) && r.amount > 0 && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && STATUSES.includes(r.status) && (r.member == null || r.member === '' || MEMBERS.includes(r.member)) && (!r.evidence || (Array.isArray(r.evidence) && r.evidence.every(validEvidence))); }
function persist(next) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); records = next; render(); return true; } catch { notify('保存失败，请检查浏览器存储空间或隐私设置。', true); return false; } }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function resetForm() { editingId = null; attachments = []; renderAttachments(); $('claim-form').reset(); $('date').value = today(); $('form-title').textContent = '＋ 新增记录'; $('save').textContent = '添加记录 ＋'; $('cancel').hidden = true; $('record-owner').textContent = '记录成员：'+(currentMember||''); }
function render() {
  const sum = list => list.reduce((n,r) => n+r.amount,0);
  const memberFilter=$('member-filter').value;
  const memberRecords=records.filter(r=>!memberFilter || (memberFilter==='unassigned' ? !r.member : r.member===memberFilter));
  $('summary-scope').textContent='汇总范围：'+(memberFilter==='unassigned'?'未指定成员':memberFilter||'全部成员')+' · 全部状态';
  $('total').textContent = money(sum(memberRecords)); $('pending').textContent = money(sum(memberRecords.filter(r=>r.status===STATUSES[0]))); $('paid').textContent = money(sum(memberRecords.filter(r=>r.status===STATUSES[1]))); $('count').textContent = `${memberRecords.length} 笔记录`;
  const visible = memberRecords.filter(r=>!$('filter').value || r.status===$('filter').value).sort((a,b)=>b.date.localeCompare(a.date));
  $('visible-count').textContent = visible.length; $('subtotal').textContent = `RM ${money(sum(visible))}`;
  $('records').replaceChildren();
  for (const r of visible) {
    const tr = document.createElement('tr');
    [r.name,r.member||'未指定成员',r.date,money(r.amount)].forEach((text,i)=>{const td=document.createElement('td');td.textContent=text;if(i===3)td.className='numeric';tr.append(td);});
    const state=document.createElement('td'),badge=document.createElement('span');badge.className=`badge state-${STATUSES.indexOf(r.status)}`;badge.textContent=r.status;state.append(badge);tr.append(state);
    const evidenceCell=document.createElement('td'); evidenceCell.className='evidence-cell'; for(const file of r.evidence||[]) {const b=document.createElement('button');b.type='button';b.className='row-action';b.textContent=file.name;b.addEventListener('click',()=>showEvidence(file));evidenceCell.append(b);} if(!r.evidence?.length)evidenceCell.textContent='—';tr.append(evidenceCell);
    const actions=document.createElement('td');
    for (const [label,action] of [['编辑',()=>edit(r)],['删除',()=>{deletingId=r.id;$('delete-dialog').showModal();}]]) { const b=document.createElement('button');b.type='button';b.textContent=label;b.className='row-action'+(label==='删除'?' delete':'');b.setAttribute('aria-label',`${label} ${r.name}`);b.addEventListener('click',action);actions.append(b); }
    tr.append(actions);$('records').append(tr);
  }
  $('empty').hidden=visible.length>0;
  $('empty').querySelector('h3').textContent=records.length?'没有符合条件的记录':'开始记录第一笔 Claim';
  $('empty').querySelector('p').textContent=records.length?'选择其他成员或状态查看记录。':'在新增记录中填写金额、日期和状态。';
}
function edit(r) { if(readingFiles)return; attachments=[...(r.evidence||[])];renderAttachments();$('evidence').value='';editingId=r.id;$('record-owner').textContent='记录成员：'+(r.member||'未指定成员');$('name').value=r.name;$('amount').value=(r.amount/100).toFixed(2);$('date').value=r.date;$('status').value=r.status;$('form-title').textContent='编辑记录';$('save').textContent='保存修改';$('cancel').hidden=false;notify('');$('entry-dialog').showModal();$('name').focus(); }
$('claim-form').addEventListener('submit',async e=>{e.preventDefault();if(!storageReady||readingFiles)return;if(!MEMBERS.includes(currentMember)){notify('请选择成员。',true);return;}const name=$('name').value.trim(),raw=$('amount').value;if(!name||!/^\d+(\.\d{1,2})?$/.test(raw)){notify('请输入项目名称及最多两位小数的金额。',true);return;}const amount=Math.round(Number(raw)*100);if(!Number.isSafeInteger(amount)||amount<=0||amount>99999999999){notify('请输入有效金额。',true);return;}const wasEditing=!!editingId;const record={id:editingId||(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`),name,amount,member:editingId?(records.find(r=>r.id===editingId)?.member||currentMember):currentMember,date:$('date').value,status:$('status').value,evidence:[...attachments],syncPending:true};const next=wasEditing?records.map(r=>r.id===editingId?record:r):[record,...records];if(!persist(next))return;resetForm();notify('本机已保存，正在写入 Google Sheets…');$('save').disabled=true;try{const synced=await syncOneRecord(record);persist(records.map(r=>r.id===record.id?synced:r));await refreshCloudRecords(true);$('cloud-message').textContent=wasEditing?'已写入 Google Sheets，并重新读取全部记录。':'已写入 Google Sheets，并重新读取全部记录。';$('entry-dialog').close();}catch(error){$('cloud-message').textContent='本机记录已保存，但云端同步失败：'+error.message+' 可点击刷新云端记录重试。';$('entry-dialog').close();}finally{$('save').disabled=!storageReady;}});
$('cancel').addEventListener('click',()=>{resetForm();notify('');$('entry-dialog').close();});
$('filter').addEventListener('change',render);
$('member-filter').addEventListener('change',render);
$('keep').addEventListener('click',()=>$('delete-dialog').close());
$('confirm-delete').addEventListener('click',async()=>{if(!deletingId)return;const id=deletingId;$('confirm-delete').disabled=true;notify('正在从 Google Sheets 删除…');try{const remote=(await claimCloudRequest({action:'list'})).records;const existing=remote.find(r=>r.id===id);if(existing)await claimCloudRequest({action:'delete',id,updatedAt:existing.updatedAt});if(persist(records.filter(r=>r.id!==id))){if(editingId===id)resetForm();notify('记录已删除并自动同步。');$('delete-dialog').close();deletingId=null;}}catch(error){notify('删除未完成：'+error.message+' 本机记录仍保留。',true);$('delete-dialog').close();}finally{$('confirm-delete').disabled=false;}});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){try{const data=migrateStatuses(JSON.parse(e.newValue||'[]'));if(!Array.isArray(data)||!data.every(validRecord))throw Error();records=data;render();resetForm();notify('记录已从另一个标签页更新。');}catch{storageReady=false;$('save').disabled=true;notify('存储数据异常，请刷新页面检查。',true);}}});
initEntryDialog();
initEvidence();
resetForm();
try { const data=migrateStatuses(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));if(!Array.isArray(data)||!data.every(validRecord))throw Error();records=data;storageReady=true; } catch { $('save').disabled=true;notify('无法读取已保存记录。请检查浏览器存储设置；原有数据未被覆盖。',true); }
render();

function validEvidence(f) { return f && typeof f.name==='string' && ['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type) && Number.isFinite(f.size) && f.size>0 && ((typeof f.data==='string' && f.data.startsWith('data:'+f.type+';base64,')) || (typeof f.id==='string' && typeof f.url==='string')); }
function initEntryDialog(){
 const entry=document.querySelector('.entry');
 const dialog=document.createElement('dialog');dialog.id='entry-dialog';dialog.setAttribute('aria-labelledby','form-title');
 entry.before(dialog);dialog.append(entry);
 const close=document.createElement('button');close.id='close-entry';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭新增记录');entry.prepend(close);
 const open=document.createElement('button');open.id='open-entry';open.type='button';open.className='add-claim';open.textContent='＋ 新增记录';
 document.querySelector('.section-head').insertBefore(open,document.querySelector('.filters'));
 open.addEventListener('click',()=>{resetForm();notify('');dialog.showModal();$('name').focus();});
 close.addEventListener('click',()=>{if(readingFiles)return;resetForm();notify('');dialog.close();});
 dialog.addEventListener('cancel',event=>{if(readingFiles){event.preventDefault();return;}resetForm();notify('');});
}
function renderAttachments(){ $('attachments').replaceChildren();attachments.forEach((file,index)=>{const li=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name;remove.type='button';remove.textContent='移除';remove.disabled=readingFiles;remove.setAttribute('aria-label','移除 '+file.name);remove.addEventListener('click',()=>{attachments.splice(index,1);renderAttachments();});li.append(name,remove);$('attachments').append(li);}); }
function initEvidence(){
 $('evidence').addEventListener('change',async()=>{
  const files=Array.from($('evidence').files);if(!files.length)return;
  if(attachments.length+files.length>3 || attachments.reduce((n,f)=>n+f.size,0)+files.reduce((n,f)=>n+f.size,0)>2*1024*1024){notify('每笔最多 3 个凭证，文件总大小不能超过 2 MB。',true);$('evidence').value='';return;}
  if(files.some(f=>!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type)||f.size===0)){notify('请选择有效的 JPG、PNG、WebP 图片或 PDF 文件。',true);$('evidence').value='';return;}
  readingFiles=true;$('save').disabled=true;$('cancel').disabled=true;$('evidence').disabled=true;renderAttachments();notify('正在读取凭证…');
  try{const loaded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,size:file.size,data:reader.result});reader.onerror=()=>reject(new Error('read'));reader.onabort=()=>reject(new Error('abort'));reader.readAsDataURL(file);})));if(location.origin==='http://127.0.0.1:8765'){const response=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:loaded})});if(!response.ok)throw Error('local-save');const result=await response.json();attachments.push(...loaded.map((file,i)=>({...file,localFile:result.files[i]})));}else{attachments.push(...loaded);}notify('凭证已选好，保存记录时会自动上传到 Google Drive。');
  }catch{notify('凭证读取或本地副本保存失败，请重试。',true);}finally{readingFiles=false;$('save').disabled=!storageReady;$('cancel').disabled=false;$('evidence').disabled=false;$('evidence').value='';renderAttachments();}
 });
 $('close-evidence').addEventListener('click',()=>$('evidence-dialog').close());
 $('evidence-dialog').addEventListener('close',()=>{ $('evidence-preview').replaceChildren();$('download-evidence').removeAttribute('href');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null; });
}
function showEvidence(file){
 if(!validEvidence(file)){notify('此凭证无法读取。',true);return;}
 if(!file.data){window.open(file.url,'_blank','noopener');return;}
 try{const bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0));if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([bytes],{type:file.type}));$('evidence-title').textContent=file.name;$('evidence-preview').replaceChildren();
 if(file.type.startsWith('image/')){const img=document.createElement('img');img.src=previewUrl;img.alt=file.name;$('evidence-preview').append(img);}else{const frame=document.createElement('iframe');frame.src=previewUrl;frame.title=file.name;$('evidence-preview').append(frame);const hint=document.createElement('p');hint.textContent='若浏览器无法预览 PDF，请下载后查看。';$('evidence-preview').append(hint);}
 $('download-evidence').href=previewUrl;$('download-evidence').download=file.name;$('evidence-dialog').showModal();}catch{notify('凭证数据损坏，无法预览。',true);}
}


function enterMember(member) {
 if(!MEMBERS.includes(member))return;
 currentMember=member;
 try{sessionStorage.setItem('claim-member',member);}catch{}
 $('login-screen').hidden=true;$('app-screen').hidden=false;
 $('current-member').textContent=member;
 $('member-filter').value='';
 $('filter').value='';
 resetForm();render();notify('');
 refreshCloudRecords().catch(()=>{});
}
document.querySelectorAll('[data-member]').forEach(button=>button.addEventListener('click',()=>enterMember(button.dataset.member)));
$('sign-out').addEventListener('click',()=>{
 if(readingFiles){notify('正在保存凭证，请稍候再切换成员。',true);return;}
 if(($('name').value.trim()||$('amount').value||attachments.length)&&!confirm('切换成员会丢弃尚未保存的表单，是否继续？'))return;
 currentMember=null;try{sessionStorage.removeItem('claim-member');}catch{}
 resetForm();$('app-screen').hidden=true;$('login-screen').hidden=false;
});
const CLAIM_ENDPOINT='https://script.google.com/macros/s/AKfycbxL-iCm5HeoLZTxowrNmo1rD9z2letwmyIrxcIrMOdbKzs85c1bJC7fNyIamu7qlczs/exec';
let cloudRefreshPromise=null;
async function claimCloudRequest(body){
 const response=await fetch(CLAIM_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});
 if(!response.ok)throw Error('接口请求失败：'+response.status);
 let result;try{result=await response.json();}catch{throw Error('接口没有返回有效数据，请检查部署权限。');}
 if(!result.ok)throw Error(result.error||'保存失败');return result;
}
function sameClaim(a,b){return ['name','member','amount','date','status'].every(key=>a[key]===b[key]);}
async function syncOneRecord(record){
 const remote=(await claimCloudRequest({action:'list'})).records;
 const existing=remote.find(item=>item.id===record.id);
 const used=new Set();
 const evidence=(record.evidence||[]).map(file=>{
  if(file.id){used.add(file.id);return {id:file.id};}
  const match=existing?.evidence?.find(item=>!used.has(item.id)&&item.name===file.name&&item.type===file.type&&item.size===file.size);
  if(match){used.add(match.id);return {id:match.id};}
  return file;
 });
 if(existing&&sameClaim(existing,record)&&evidence.length===(existing.evidence||[]).length&&evidence.every(item=>item.id))return existing;
 const result=await claimCloudRequest({action:'save',record:{...record,evidence},updatedAt:existing?.updatedAt});
 const synced=result.records.find(item=>item.id===record.id);
 if(!synced||!sameClaim(synced,record))throw Error('云端核对失败。');
 return synced;
}
async function synchronizeAll(){
 const local=migrateStatuses(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));
 if(!Array.isArray(local)||!local.every(validRecord))throw Error('本机记录异常，未上传。');
 let saved=0;
 for(const record of local){
  if(!MEMBERS.includes(record.member))throw Error('请先为「'+record.name+'」指定成员。');
  const synced=await syncOneRecord(record);
  if(synced.updatedAt!==record.updatedAt)saved++;
  const index=local.findIndex(item=>item.id===record.id);
  local[index]=synced;
  if(!persist([...local]))throw Error('云端已保存，但本机更新失败。');
 }
 return {saved,total:local.length};
}
async function refreshCloudRecords(quiet=false){
 if(cloudRefreshPromise)return cloudRefreshPromise;
 const message=$('cloud-message');
 if(!quiet)message.textContent='正在读取 Google Sheets…';
 cloudRefreshPromise=(async()=>{
  try{
   const local=migrateStatuses(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));
   if(!Array.isArray(local)||!local.every(validRecord))throw Error('本机记录异常，未覆盖。');
   const pending=local.filter(record=>record.syncPending || !record.updatedAt);
   for(const record of pending)await syncOneRecord(record);
   const remote=migrateStatuses((await claimCloudRequest({action:'list'})).records);
   if(!Array.isArray(remote)||!remote.every(validRecord))throw Error('云端返回的记录格式异常。');
   if(!persist(remote))throw Error('云端已读取，但本机缓存更新失败。');
   message.textContent='已从 Google Sheets 加载 '+remote.length+' 笔记录。';
   return remote;
  }catch(error){
   message.textContent='无法读取云端，正在显示本机记录：'+error.message+' 可点击重试。';
   throw error;
  }finally{cloudRefreshPromise=null;}
 })();
 return cloudRefreshPromise;
}
document.getElementById('sync-cloud').addEventListener('click',async()=>{
 const button=document.getElementById('sync-cloud'),message=document.getElementById('cloud-message');
 button.disabled=true;
 try{
  await refreshCloudRecords();
 }catch(error){}
 finally{button.disabled=false;}
});
window.addEventListener('focus',()=>{if(currentMember&&!$('entry-dialog').open&&!readingFiles)refreshCloudRecords(true).catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentMember&&!$('entry-dialog').open&&!readingFiles)refreshCloudRecords(true).catch(()=>{});});
setInterval(()=>{if(!document.hidden&&currentMember&&!$('entry-dialog').open&&!readingFiles)refreshCloudRecords(true).catch(()=>{});},60000);
try{enterMember(sessionStorage.getItem('claim-member'));}catch{}
