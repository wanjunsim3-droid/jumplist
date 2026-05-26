const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelFilePath = path.join(__dirname, '힘찬 2026년 매물정리 에이치12 (1) (6) (1).xlsx');
const outputJsonPath = path.join(__dirname, 'public', 'properties.json');
const rootJsonPath = path.join(__dirname, 'properties.json');

if (!fs.existsSync(excelFilePath)) {
  console.error('Excel file not found!');
  process.exit(1);
}

const workbook = XLSX.readFile(excelFilePath);

function cleanNumber(val) {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/,/g, '');
  if (str === '-' || str === '' || str.toLowerCase() === 'none' || str.toLowerCase() === 'null') return 0;
  if (str.includes('~')) str = str.split('~')[0].trim();
  let cleanStr = str.replace(/[^0-9.]/g, '');
  let num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

function cleanArea(val) {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/평/g, '').replace(/약/g, '');
  let num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function shouldSkipRow(row) {
  if (!row || row.length === 0 || !row[0]) return true;
  const col0 = String(row[0]).trim();

  if (col0 === '주소' || col0.startsWith('주소지') || col0 === '주소 ' || col0 === '주소지') return true;
  if (/^\d+월\s*\d+일$/.test(col0)) return true;

  return false;
}

function isUrlBroken(url) {
  try {
    const decoded = decodeURIComponent(url);
    if (/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(decoded)) return true;
    
    // 디코딩했을 때 한글이 전혀 없고 라틴1 깨짐 문자(ì, ë, ê, í 등)가 들어있는 경우 깨진 링크로 판단
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(decoded);
    const hasLatinCorrupt = /[ìëêíæå]/.test(decoded);
    if (!hasKorean && hasLatinCorrupt) {
      return true;
    }
    return false;
  } catch (e) {
    return true;
  }
}

function getMapUrl(sheet, r, c, val, address) {
  const cellAddress = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[cellAddress];
  let url = '';
  if (cell && cell.l && cell.l.Target) {
    url = cell.l.Target;
  } else if (val) {
    url = String(val).trim();
  }

  // Repair corrupted Latin1 target URL
  if (url) {
    try {
      const unescaped = decodeURIComponent(url);
      const repaired = Buffer.from(unescaped, 'latin1').toString('utf8');
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(repaired);
      const origHasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(url);
      if (hasKorean && !origHasKorean) {
        url = repaired;
      }
    } catch (e) {
      try {
        const repaired = Buffer.from(url, 'latin1').toString('utf8');
        if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(repaired) && !/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(url)) {
          url = repaired;
        }
      } catch (err) {}
    }
  }

  // 복구 후에도 URL이 깨진 경우 → 주소로 재생성
  if (url && isUrlBroken(url)) {
    if (address && address.trim() !== '') {
      const cleanAddr = address.replace(/\*공실/g, '').replace(/\*/g, '').trim();
      console.log(`  [URL복구] ID주소: ${address} → 주소 기반 URL 재생성 (깨진 URL 판정)`);
      return `https://map.naver.com/p/search/${encodeURIComponent(cleanAddr)}`;
    }
    return '';
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (address && address.trim() !== '') {
      const cleanAddr = address.replace(/\*공실/g, '').replace(/\*/g, '').trim();
      return `https://map.naver.com/p/search/${encodeURIComponent(cleanAddr)}`;
    }
    return '';
  }

  // If the repaired/original URL is a search URL containing unencoded Korean, encode it properly
  if (url.startsWith('https://map.naver.com/p/search/') || url.startsWith('https://map.naver.com/v5/search/')) {
    const prefix = url.startsWith('https://map.naver.com/p/search/') 
      ? 'https://map.naver.com/p/search/' 
      : 'https://map.naver.com/v5/search/';
    const queryPart = url.substring(prefix.length);
    try {
      const decodedQuery = decodeURIComponent(queryPart);
      // 디코딩된 검색어가 깨진 경우(대체문자 포함 또는 한글 미포함 라틴1 조합 존재 시) 주소로 대체
      const isBroken = /[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(decodedQuery) ||
                       (!/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(decodedQuery) && /[ìëêíæå]/.test(decodedQuery));
      if (isBroken) {
        if (address && address.trim() !== '') {
          const cleanAddr = address.replace(/\*공실/g, '').replace(/\*/g, '').trim();
          console.log(`  [URL복구] 검색어 깨짐: ${address} → 주소 기반 URL 재생성`);
          return `https://map.naver.com/p/search/${encodeURIComponent(cleanAddr)}`;
        }
      }
      url = prefix + encodeURIComponent(decodedQuery);
    } catch (e) {
      // 디코딩 실패 시 주소로 대체
      if (address && address.trim() !== '') {
        const cleanAddr = address.replace(/\*공실/g, '').replace(/\*/g, '').trim();
        return `https://map.naver.com/p/search/${encodeURIComponent(cleanAddr)}`;
      }
      url = prefix + encodeURIComponent(queryPart);
    }
  }

  // 카카오 URL에 한글이 미인코딩된 경우 인코딩 처리
  if (url.startsWith('https://map.kakao.com/') && /[가-힣]/.test(url)) {
    const qIdx = url.indexOf('?q=');
    if (qIdx !== -1) {
      const base = url.substring(0, qIdx + 3);
      const query = url.substring(qIdx + 3);
      url = base + encodeURIComponent(query);
    }
  }

  return url;
}

const allProperties = [];
let idCounter = 1;

workbook.SheetNames.forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (data.length === 0) return;

  if (sheetName === '26년') {
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (shouldSkipRow(row)) continue;
      const address = String(row[0]).trim();
      allProperties.push({
        id: idCounter++,
        address,
        map_url: getMapUrl(sheet, i, 1, row[1], address),
        floor: row[2] ? String(row[2]).trim() : '',
        shop_name: row[3] ? String(row[3]).trim() : '',
        area: cleanArea(row[4]),
        deposit: cleanNumber(row[5]),
        rent: cleanNumber(row[6]),
        premium: cleanNumber(row[7]),
        maintenance: cleanNumber(row[8]),
        note: row[9] ? String(row[9]).trim() : '',
        sheet_name: sheetName
      });
    }
  }
  else if (sheetName === '11월27일') {
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (shouldSkipRow(row)) continue;
      const address = String(row[0]).trim();
      allProperties.push({
        id: idCounter++,
        address,
        map_url: getMapUrl(sheet, i, 1, row[1], address),
        floor: row[2] ? String(row[2]).trim() : '',
        shop_name: '',
        area: cleanArea(row[3]),
        deposit: cleanNumber(row[4]),
        rent: cleanNumber(row[5]),
        premium: cleanNumber(row[6]),
        maintenance: cleanNumber(row[7]),
        note: row[8] ? String(row[8]).trim() : '',
        sheet_name: sheetName
      });
    }
  }
  else if (sheetName === 'Sheet1') {
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (shouldSkipRow(row)) continue;
      const address = String(row[0]).trim();
      allProperties.push({
        id: idCounter++,
        address,
        map_url: getMapUrl(sheet, i, 1, row[1], address),
        floor: row[2] ? String(row[2]).trim() : '',
        shop_name: row[3] ? String(row[3]).trim() : '',
        area: cleanArea(row[4]),
        deposit: cleanNumber(row[5]),
        rent: cleanNumber(row[6]),
        premium: cleanNumber(row[7]),
        maintenance: cleanNumber(row[8]),
        note: row[9] ? String(row[9]).trim() : '',
        sheet_name: sheetName
      });
    }
  }
  else if (sheetName === 'Sheet2') {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (shouldSkipRow(row)) continue;
      const address = String(row[0]).trim();
      allProperties.push({
        id: idCounter++,
        address,
        map_url: getMapUrl(sheet, i, 1, row[1], address),
        floor: row[2] ? String(row[2]).trim() : '',
        shop_name: row[3] ? String(row[3]).trim() : '',
        area: cleanArea(row[4]),
        deposit: cleanNumber(row[5]),
        rent: cleanNumber(row[6]),
        premium: cleanNumber(row[7]),
        maintenance: cleanNumber(row[8]),
        note: row[9] ? String(row[9]).trim() : '',
        sheet_name: sheetName
      });
    }
  }
});

fs.writeFileSync(outputJsonPath, JSON.stringify(allProperties, null, 2), 'utf-8');
fs.writeFileSync(rootJsonPath, JSON.stringify(allProperties, null, 2), 'utf-8');
console.log(`Generated public/properties.json and root properties.json with ${allProperties.length} items.`);
