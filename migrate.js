const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('./db');
const bcrypt = require('bcryptjs');

const excelFilePath = path.join(__dirname, '힘찬 2026년 매물정리 에이치12 (1) (6) (1).xlsx');

if (!fs.existsSync(excelFilePath)) {
  console.error('Excel file not found at:', excelFilePath);
  process.exit(1);
}

console.log('Reading Excel file...');
const workbook = XLSX.readFile(excelFilePath);

// Help functions to parse values
function cleanNumber(val) {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/,/g, '');
  if (str === '-' || str === '' || str.toLowerCase() === 'none' || str.toLowerCase() === 'null') return 0;
  
  // Extract first sequence of digits
  let match = str.match(/^[~~\s\d]+/);
  if (str.includes('~')) {
    // If range like "1,000~2,000", take the lower bound
    str = str.split('~')[0].trim();
  }
  
  // Extract only numbers
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

// Extract hyperlink Target if present, otherwise fallback to generating Naver Map search link
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

  // If URL is not valid, generate a Naver Map search URL from the address
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (address && address.trim() !== '') {
      // Clean address string for cleaner search url
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
      url = prefix + encodeURIComponent(decodedQuery);
    } catch (e) {
      url = prefix + encodeURIComponent(queryPart);
    }
  }

  return url;
}

db.serialize(() => {
  // Clear existing properties (if any) to prevent duplication during migration
  db.run('DELETE FROM properties');
  console.log('Cleared existing properties from database.');

  // Create default Admin account if not exists
  const adminUsername = 'admin';
  const adminPassword = 'adminpassword123'; // Default secure password
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(adminPassword, salt);

  db.get('SELECT id FROM users WHERE username = ?', [adminUsername], (err, row) => {
    if (err) {
      console.error('Error checking admin user:', err);
    } else if (!row) {
      db.run(
        `INSERT INTO users (username, password, name, phone, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [adminUsername, hashedPassword, '관리자', '010-0000-0000', 'ADMIN', 'APPROVED'],
        (err2) => {
          if (err2) {
            console.error('Failed to create default admin:', err2.message);
          } else {
            console.log('--------------------------------------------------');
            console.log('Default Admin Account Created:');
            console.log(`Username: ${adminUsername}`);
            console.log(`Password: ${adminPassword}`);
            console.log('--------------------------------------------------');
          }
        }
      );
    }
  });

  const stmt = db.prepare(`
    INSERT INTO properties (
      address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note, sheet_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Loop through sheets
  workbook.SheetNames.forEach((sheetName) => {
    console.log(`Processing sheet: ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length === 0) return;

    if (sheetName === '26년') {
      // Row 0 is header: [주소, 네이버지도, 층수, 상호, 평수, 보증금, 임대료, 권리금, 관리비, 비고]
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (shouldSkipRow(row)) continue;
        
        const address = row[0] ? String(row[0]).trim() : '';
        const mapUrl = getMapUrl(sheet, i, 1, row[1], address);
        const floor = row[2] ? String(row[2]).trim() : '';
        const shopName = row[3] ? String(row[3]).trim() : '';
        const area = cleanArea(row[4]);
        const deposit = cleanNumber(row[5]);
        const rent = cleanNumber(row[6]);
        const premium = cleanNumber(row[7]);
        const maintenance = cleanNumber(row[8]);
        const note = row[9] ? String(row[9]).trim() : '';

        stmt.run(address, mapUrl, floor, shopName, area, deposit, rent, premium, maintenance, note, sheetName);
      }
    } 
    else if (sheetName === '11월27일') {
      // Header is at row 1: [주소, 네이버지도 바로가기, 층수, 평수, 보증금(만원), 임대료(만원), 권리금(만원), 관리비(만원), 비고]
      // (Note: there is no "상호" in this sheet)
      for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (shouldSkipRow(row)) continue;
        
        const address = row[0] ? String(row[0]).trim() : '';
        const mapUrl = getMapUrl(sheet, i, 1, row[1], address);
        const floor = row[2] ? String(row[2]).trim() : '';
        const shopName = ''; // Not present
        const area = cleanArea(row[3]);
        const deposit = cleanNumber(row[4]);
        const rent = cleanNumber(row[5]);
        const premium = cleanNumber(row[6]);
        const maintenance = cleanNumber(row[7]);
        const note = row[8] ? String(row[8]).trim() : '';

        stmt.run(address, mapUrl, floor, shopName, area, deposit, rent, premium, maintenance, note, sheetName);
      }
    }
    else if (sheetName === 'Sheet1') {
      // Row 0 is header: [주소, 지도, 층수, 상호, 평수, 보증금, 임대료, 권리금, 관리비, 비고]
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (shouldSkipRow(row)) continue;

        const address = row[0] ? String(row[0]).trim() : '';
        const mapUrl = getMapUrl(sheet, i, 1, row[1], address);
        const floor = row[2] ? String(row[2]).trim() : '';
        const shopName = row[3] ? String(row[3]).trim() : '';
        const area = cleanArea(row[4]);
        const deposit = cleanNumber(row[5]);
        const rent = cleanNumber(row[6]);
        const premium = cleanNumber(row[7]);
        const maintenance = cleanNumber(row[8]);
        const note = row[9] ? String(row[9]).trim() : '';

        stmt.run(address, mapUrl, floor, shopName, area, deposit, rent, premium, maintenance, note, sheetName);
      }
    }
    else if (sheetName === 'Sheet2') {
      // Row 0 is already data: ['광진구 중곡동 31-1', '지도', '1층', '교동쿡과 부동산', 28, 3000, 230, 6000, '-', 'Unnamed: 9']
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (shouldSkipRow(row)) continue;

        const address = row[0] ? String(row[0]).trim() : '';
        const mapUrl = getMapUrl(sheet, i, 1, row[1], address);
        const floor = row[2] ? String(row[2]).trim() : '';
        const shopName = row[3] ? String(row[3]).trim() : '';
        const area = cleanArea(row[4]);
        const deposit = cleanNumber(row[5]);
        const rent = cleanNumber(row[6]);
        const premium = cleanNumber(row[7]);
        const maintenance = cleanNumber(row[8]);
        const note = row[9] ? String(row[9]).trim() : '';

        stmt.run(address, mapUrl, floor, shopName, area, deposit, rent, premium, maintenance, note, sheetName);
      }
    }
  });

  stmt.finalize(() => {
    console.log('Migration statements finalized.');
    
    // Check properties count
    db.get('SELECT COUNT(*) as count FROM properties', (err, row) => {
      if (err) {
        console.error('Error counting migrated properties:', err);
      } else {
        console.log(`Successfully migrated ${row.count} properties into SQLite database.`);
      }
    });
  });
});
