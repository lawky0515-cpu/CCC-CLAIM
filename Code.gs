// Temporary open API: anyone with the deployment URL can read and edit Claims.
const SHEET_ID = '1nL7PSsnCPzy2WHPO2s7BSVguF0ap4KRc9eGQRpsP6uI';
const FOLDER_ID = '1IxhuJzYp3pmH0QoTHyVioSs4rs3vl5uL';
const MEMBERS = ['BOSS L', 'BOSS W', 'BOSS K'];
const STATUSES = ['未支付', '已支付'];
const HEADERS = ['ID','成员','项目说明','金额 RM','日期','状态','凭证链接','更新时间','凭证数据'];
const MIME = ['image/jpeg','image/png','image/webp','application/pdf'];

function setup() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  const sheet = book.getSheetByName('Claims') || book.insertSheet('Claims');
  if (!sheet.getLastRow()) sheet.appendRow(HEADERS);
  const existing = sheet.getRange(1, 1, 1, 8).getValues()[0];
  if (existing.join('|') !== HEADERS.slice(0, 8).join('|')) throw new Error('Claims 表头不匹配，请勿覆盖现有数据。');
  const extra = sheet.getRange(1, 9).getValue();
  if (extra && extra !== HEADERS[8]) throw new Error('第 9 列已有其他数据，请先检查。');
  sheet.getRange(1, 9).setValue(HEADERS[8]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 9).setBackground('#173f43').setFontColor('#ffffff').setFontWeight('bold');
  sheet.autoResizeColumns(1, 8);
  console.log('表格已准备好，凭证文件夹：' + DriveApp.getFolderById(FOLDER_ID).getName());
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'list') {
      return json_({ok:true,records:list_(sheet_())});
    }
    return json_({ok:true,service:'Company Claims',version:2,access:'temporary-open'});
  } catch(error) {
    return json_({ok:false,error:String(error.message || error)});
  }
}
function sheet_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Claims');
  if (!sheet || sheet.getRange(1,9).getValue() !== HEADERS[8]) throw new Error('请先运行 setup。');
  return sheet;
}
function list_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues().filter(r=>r[0]).map(r=>({
    id:String(r[0]), member:String(r[1]), name:String(r[2]), amount:Math.round(Number(r[3])*100),
    date:r[4] instanceof Date ? Utilities.formatDate(r[4], 'Asia/Kuala_Lumpur', 'yyyy-MM-dd') : String(r[4]),
    status:String(r[5]), updatedAt:r[7] instanceof Date ? r[7].toISOString() : String(r[7]),
    evidence:r[8] ? JSON.parse(String(r[8])) : []
  }));
}
function text_(value) {
  // Prevent user-entered descriptions from becoming spreadsheet formulas.
  return /^[=+@\-\t\r\n']/.test(value) ? "'"+value : value;
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  const created = [];
  let committed = false;
  try {
    if (!e || !e.postData || e.postData.contents.length > 3000000) throw new Error('请求过大或为空。');
    const request = JSON.parse(e.postData.contents);
    acquired = lock.tryLock(20000);
    if (!acquired) throw new Error('其他成员正在保存，请稍后重试。');
    const sheet = sheet_();
    const records = list_(sheet);
    if (request.action === 'list') return json_({ok:true,records:records});
    if (!['save','delete'].includes(request.action)) throw new Error('不支持的操作。');
    const r = request.record;
    const id = request.action === 'delete' ? request.id : r && r.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效记录 ID。');
    const rows = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues() : [];
    const index = rows.findIndex(row=>String(row[0])===id);
    const previous = records.find(item=>item.id===id);
    if (previous && request.updatedAt !== previous.updatedAt) throw new Error('记录已被修改，请刷新后重试。');
    if (request.action === 'delete') {
      if (index>=0) sheet.deleteRow(index+2);
      return json_({ok:true,records:list_(sheet)});
    }
    if (!MEMBERS.includes(r.member) || !STATUSES.includes(r.status)
      || typeof r.name!=='string' || !r.name.trim() || r.name.length>120
      || !Number.isSafeInteger(r.amount) || r.amount<=0 || r.amount>99999999999
      || typeof r.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)
      || isNaN(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10)!==r.date) throw new Error('请检查成员、项目、金额、日期和状态。');
    if (!Array.isArray(r.evidence) || r.evidence.length>3) throw new Error('每笔最多 3 个凭证。');
    let total = 0;
    const prepared = r.evidence.map(file=>{
      if (file.id) {
        const old = (previous && previous.evidence || []).find(item=>item.id===file.id);
        if (!old) throw new Error('凭证不属于此记录。');
        total += old.size;
        return {old:old};
      }
      if (!MIME.includes(file.type) || typeof file.name!=='string' || file.name.length>200
        || typeof file.data!=='string' || !file.data.startsWith('data:'+file.type+';base64,')) throw new Error('无效凭证格式。');
      const bytes = Utilities.base64Decode(file.data.split(',')[1]);
      if (!bytes.length) throw new Error('凭证为空。');
      total += bytes.length;
      return {file:file,bytes:bytes};
    });
    if (total>2*1024*1024) throw new Error('每笔凭证合计不能超过 2 MB。');
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const evidence = prepared.map(item=>{
      if (item.old) return item.old;
      const file = folder.createFile(Utilities.newBlob(item.bytes,item.file.type,id+'_'+item.file.name));
      created.push(file);
      return {id:file.getId(),name:item.file.name,type:item.file.type,size:item.bytes.length,url:file.getUrl()};
    });
    const updated = new Date().toISOString();
    const target = index>=0 ? index+2 : sheet.getLastRow()+1;
    sheet.getRange(target,5).setNumberFormat('@');
    sheet.getRange(target,1,1,9).setValues([[id,r.member,text_(r.name.trim()),r.amount/100,r.date,r.status,evidence.map(f=>f.url).join('\n'),updated,JSON.stringify(evidence)]]);
    sheet.getRange(target,4).setNumberFormat('0.00');
    committed = true;
    return json_({ok:true,records:list_(sheet)});
  } catch(error) {
    if (!committed) created.forEach(file=>{try{file.setTrashed(true);}catch(ignore){}});
    return json_({ok:false,error:String(error.message || error)});
  } finally {
    if (acquired) lock.releaseLock();
  }
}
