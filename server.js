const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'himchan-secret-key-2026';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for Excel Uploads
const upload = multer({ dest: 'uploads/' });

// --- MIDDLEWARES ---

// Verify JWT token and attach user payload
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: '인증 토큰이 없습니다.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = user;
    next();
  });
}

// Verify if the user is APPROVED
function requireApproved(req, res, next) {
  db.get('SELECT status, role FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: '데이터베이스 오류' });
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    
    if (user.status !== 'APPROVED' && user.role !== 'ADMIN') {
      return res.status(403).json({ message: '승인되지 않은 회원입니다. 관리자 승인을 기다려주세요.', status: user.status });
    }
    next();
  });
}

// Verify Admin role
function requireAdmin(req, res, next) {
  db.get('SELECT role FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: '데이터베이스 오류' });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
    }
    next();
  });
}

// --- AUTH API ---

// User Registration
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, phone } = req.body;
  if (!username || !password || !name || !phone) {
    return res.status(400).json({ message: '모든 필드를 입력해 주세요.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  db.run(
    `INSERT INTO users (username, password, name, phone, status, role) VALUES (?, ?, ?, ?, 'PENDING', 'USER')`,
    [username, hashedPassword, name, phone],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ message: '이미 존재하는 아이디입니다.' });
        }
        return res.status(500).json({ message: '회원가입 실패: ' + err.message });
      }
      res.status(201).json({ message: '회원가입 신청이 완료되었습니다. 관리자의 승인을 기다려주세요.' });
    }
  );
});

// User Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '아이디와 비밀번호를 입력해 주세요.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(400).json({ message: '존재하지 않는 회원입니다.' });

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) return res.status(400).json({ message: '비밀번호가 일치하지 않습니다.' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, status: user.status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        status: user.status
      }
    });
  });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, name, phone, role, status FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    res.json(user);
  });
});

// --- PROPERTIES API ---

// Get Properties (with query filters)
app.get('/api/properties', authenticateToken, requireApproved, (req, res) => {
  let { 
    search, 
    minArea, maxArea, 
    minDeposit, maxDeposit, 
    minRent, maxRent, 
    minPremium, maxPremium,
    sheet,
    region,
    page, limit
  } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;
  const offset = (page - 1) * limit;

  let query = `SELECT * FROM properties WHERE 1=1`;
  let countQuery = `SELECT COUNT(*) as count FROM properties WHERE 1=1`;
  let params = [];
  let countParams = [];

  // Search keyword (Address, Shop name, Note)
  if (search) {
    const searchPattern = `%${search}%`;
    query += ` AND (address LIKE ? OR shop_name LIKE ? OR note LIKE ?)`;
    countQuery += ` AND (address LIKE ? OR shop_name LIKE ? OR note LIKE ?)`;
    params.push(searchPattern, searchPattern, searchPattern);
    countParams.push(searchPattern, searchPattern, searchPattern);
  }

  // Filter Region (matches prefix of address)
  if (region) {
    const regionPattern = `${region}%`;
    query += ` AND address LIKE ?`;
    countQuery += ` AND address LIKE ?`;
    params.push(regionPattern);
    countParams.push(regionPattern);
  }

  // Filter Area
  if (minArea) {
    query += ` AND area >= ?`;
    countQuery += ` AND area >= ?`;
    params.push(parseFloat(minArea));
    countParams.push(parseFloat(minArea));
  }
  if (maxArea) {
    query += ` AND area <= ?`;
    countQuery += ` AND area <= ?`;
    params.push(parseFloat(maxArea));
    countParams.push(parseFloat(maxArea));
  }

  // Filter Deposit
  if (minDeposit) {
    query += ` AND deposit >= ?`;
    countQuery += ` AND deposit >= ?`;
    params.push(parseInt(minDeposit));
    countParams.push(parseInt(minDeposit));
  }
  if (maxDeposit) {
    query += ` AND deposit <= ?`;
    countQuery += ` AND deposit <= ?`;
    params.push(parseInt(maxDeposit));
    countParams.push(parseInt(maxDeposit));
  }

  // Filter Rent
  if (minRent) {
    query += ` AND rent >= ?`;
    countQuery += ` AND rent >= ?`;
    params.push(parseInt(minRent));
    countParams.push(parseInt(minRent));
  }
  if (maxRent) {
    query += ` AND rent <= ?`;
    countQuery += ` AND rent <= ?`;
    params.push(parseInt(maxRent));
    countParams.push(parseInt(maxRent));
  }

  // Filter Premium
  if (minPremium) {
    query += ` AND premium >= ?`;
    countQuery += ` AND premium >= ?`;
    params.push(parseInt(minPremium));
    countParams.push(parseInt(minPremium));
  }
  if (maxPremium) {
    query += ` AND premium <= ?`;
    countQuery += ` AND premium <= ?`;
    params.push(parseInt(maxPremium));
    countParams.push(parseInt(maxPremium));
  }

  // Filter Sheet Name
  if (sheet) {
    query += ` AND sheet_name = ?`;
    countQuery += ` AND sheet_name = ?`;
    params.push(sheet);
    countParams.push(sheet);
  }

  query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  // Get total count for pagination
  db.get(countQuery, countParams, (err, countRow) => {
    if (err) return res.status(500).json({ message: '데이터베이스 조회 오류: ' + err.message });
    const totalCount = countRow ? countRow.count : 0;

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ message: '데이터베이스 조회 오류: ' + err.message });
      res.json({
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        data: rows
      });
    });
  });
});

// Get Unique Regions from properties addresses
app.get('/api/properties/regions', authenticateToken, requireApproved, (req, res) => {
  db.all('SELECT DISTINCT address FROM properties', (err, rows) => {
    if (err) return res.status(500).json({ message: '지역 목록 조회 실패: ' + err.message });
    
    const regionsSet = new Set();
    rows.forEach(row => {
      if (!row.address) return;
      const addr = row.address.trim();
      const parts = addr.split(/\s+/);
      if (parts.length > 0) {
        const first = parts[0];
        const second = parts[1] || '';
        
        // Define common administrative suffixes
        if (second && (second.endsWith('구') || second.endsWith('시') || second.endsWith('군'))) {
          regionsSet.add(`${first} ${second}`);
        } else {
          // If first ends with 구/시/군 or matches major regions like 서울/경기
          if (first.endsWith('구') || first.endsWith('시') || first.endsWith('군') || first === '서울' || first === '경기') {
            regionsSet.add(first);
          } else {
            // General fallback: first word
            regionsSet.add(first);
          }
        }
      }
    });

    const sortedRegions = Array.from(regionsSet).filter(r => r.length > 1).sort();
    res.json(sortedRegions);
  });
});

// Add Single Property (ADMIN only)
app.post('/api/properties', authenticateToken, requireAdmin, (req, res) => {
  const { address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note } = req.body;
  
  if (!address) return res.status(400).json({ message: '주소는 필수 항목입니다.' });

  db.run(
    `INSERT INTO properties (address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note, sheet_name) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '수동 등록')`,
    [address, map_url, floor, shop_name, area || 0, deposit || 0, rent || 0, premium || 0, maintenance || 0, note || ''],
    function(err) {
      if (err) return res.status(500).json({ message: '매물 등록 실패: ' + err.message });
      res.status(201).json({ message: '매물이 성공적으로 등록되었습니다.', id: this.lastID });
    }
  );
});

// Update Single Property (ADMIN only)
app.put('/api/properties/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note } = req.body;

  db.run(
    `UPDATE properties 
     SET address = ?, map_url = ?, floor = ?, shop_name = ?, area = ?, deposit = ?, rent = ?, premium = ?, maintenance = ?, note = ?
     WHERE id = ?`,
    [address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note, id],
    function(err) {
      if (err) return res.status(500).json({ message: '매물 수정 실패: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ message: '해당 매물을 찾을 수 없습니다.' });
      res.json({ message: '매물이 성공적으로 수정되었습니다.' });
    }
  );
});

// Delete Single Property (ADMIN only)
app.delete('/api/properties/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM properties WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ message: '매물 삭제 실패: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '해당 매물을 찾을 수 없습니다.' });
    res.json({ message: '매물이 성공적으로 삭제되었습니다.' });
  });
});

// --- ADMIN USERS API ---

// Get Users List (ADMIN only)
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, username, name, phone, role, status, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ message: '사용자 목록 조회 실패' });
    res.json(rows);
  });
});

// Update User Approval Status (ADMIN only)
app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'APPROVED', 'REJECTED', 'PENDING'

  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
    return res.status(400).json({ message: '올바르지 않은 상태 값입니다.' });
  }

  db.run('UPDATE users SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ message: '회원 상태 변경 실패: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '해당 회원을 찾을 수 없습니다.' });
    res.json({ message: `회원 상태가 ${status}로 성공적으로 변경되었습니다.` });
  });
});

// Bulk Import from Excel Upload (ADMIN only)
app.post('/api/admin/upload-excel', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '엑셀 파일을 업로드해 주세요.' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    
    // Help functions (same as in migrate.js)
    const cleanNumber = (val) => {
      if (val === undefined || val === null) return 0;
      let str = String(val).trim().replace(/,/g, '');
      if (str === '-' || str === '' || str.toLowerCase() === 'none') return 0;
      if (str.includes('~')) str = str.split('~')[0].trim();
      let cleanStr = str.replace(/[^0-9.]/g, '');
      let num = parseFloat(cleanStr);
      return isNaN(num) ? 0 : num;
    };

    const cleanArea = (val) => {
      if (val === undefined || val === null) return 0;
      let str = String(val).trim().replace(/평/g, '').replace(/약/g, '');
      let num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    const shouldSkipRow = (row) => {
      if (!row || row.length === 0 || !row[0]) return true;
      const col0 = String(row[0]).trim();

      if (col0 === '주소' || col0.startsWith('주소지') || col0 === '주소 ' || col0 === '주소지') return true;
      if (/^\d+월\s*\d+일$/.test(col0)) return true;

      return false;
    };

    const getMapUrl = (sheet, r, c, val, address) => {
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
          url = prefix + encodeURIComponent(decodedQuery);
        } catch (e) {
          url = prefix + encodeURIComponent(queryPart);
        }
      }

      return url;
    };

    db.serialize(() => {
      // Opt: drop current listings or append. Let's support both but default to append.
      // For user simplicity, we empty it and write new when upload is done, or append.
      // Let's do APPEND for safety, or clear it if they specify a clear query param.
      const clearDb = req.query.clear === 'true';
      if (clearDb) {
        db.run('DELETE FROM properties');
      }

      const stmt = db.prepare(`
        INSERT INTO properties (
          address, map_url, floor, shop_name, area, deposit, rent, premium, maintenance, note, sheet_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let totalInserted = 0;

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length === 0) return;

        // Same sheet mapping logic
        if (sheetName === '26년' || sheetName === 'Sheet1') {
          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (shouldSkipRow(row)) continue;
            const address = row[0] ? String(row[0]).trim() : '';
            stmt.run(
              address,
              getMapUrl(sheet, i, 1, row[1], address),
              row[2] ? String(row[2]).trim() : '',
              row[3] ? String(row[3]).trim() : '',
              cleanArea(row[4]),
              cleanNumber(row[5]),
              cleanNumber(row[6]),
              cleanNumber(row[7]),
              cleanNumber(row[8]),
              row[9] ? String(row[9]).trim() : '',
              sheetName + ' (업로드)'
            );
            totalInserted++;
          }
        } 
        else if (sheetName === '11월27일') {
          for (let i = 2; i < data.length; i++) {
            const row = data[i];
            if (shouldSkipRow(row)) continue;
            const address = row[0] ? String(row[0]).trim() : '';
            stmt.run(
              address,
              getMapUrl(sheet, i, 1, row[1], address),
              row[2] ? String(row[2]).trim() : '',
              '',
              cleanArea(row[3]),
              cleanNumber(row[4]),
              cleanNumber(row[5]),
              cleanNumber(row[6]),
              cleanNumber(row[7]),
              row[8] ? String(row[8]).trim() : '',
              sheetName + ' (업로드)'
            );
            totalInserted++;
          }
        }
        else {
          // Fallback or Sheet2 mapping (treat row 0 as header values or just data)
          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (shouldSkipRow(row)) continue;
            const address = row[0] ? String(row[0]).trim() : '';
            stmt.run(
              address,
              getMapUrl(sheet, i, 1, row[1], address),
              row[2] ? String(row[2]).trim() : '',
              row[3] ? String(row[3]).trim() : '',
              cleanArea(row[4]),
              cleanNumber(row[5]),
              cleanNumber(row[6]),
              cleanNumber(row[7]),
              cleanNumber(row[8]),
              row[9] ? String(row[9]).trim() : '',
              sheetName + ' (업로드)'
            );
            totalInserted++;
          }
        }
      });

      stmt.finalize((err) => {
        // Clean up temp file
        fs.unlinkSync(req.file.path);
        if (err) {
          return res.status(500).json({ message: '엑셀 데이터 저장 오류: ' + err.message });
        }
        res.json({ message: `성공적으로 ${totalInserted}개의 매물 데이터를 적재하였습니다.` });
      });
    });

  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: '엑셀 파일 해석 오류: ' + error.message });
  }
});

// Fallback HTML router (serve SPA pages correctly if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
