// ============================================================
// 카카오 알림 기능 (Kakao Notification)
// ============================================================
let kakaoInitialized = false;

function initKakao() {
  const appKey = localStorage.getItem('kakao_app_key');
  if (!appKey) return;
  try {
    if (typeof Kakao === 'undefined') return;
    if (!Kakao.isInitialized()) {
      Kakao.init(appKey);
    }
    kakaoInitialized = true;
  } catch (e) {
    console.warn('Kakao init failed:', e);
  }
}

function isKakaoConnected() {
  if (!kakaoInitialized || typeof Kakao === 'undefined') return false;
  return !!Kakao.Auth.getAccessToken();
}

function updateKakaoStatusUI() {
  const dot = document.getElementById('kakao-status-dot');
  const text = document.getElementById('kakao-status-text');
  const loginBtn = document.getElementById('kakao-login-btn');
  const logoutBtn = document.getElementById('kakao-logout-btn');
  const testBtn = document.getElementById('kakao-test-btn');
  const keyInput = document.getElementById('kakao-app-key-input');

  if (!dot) return;

  const appKey = localStorage.getItem('kakao_app_key');
  if (keyInput && appKey) keyInput.value = appKey;

  if (isKakaoConnected()) {
    dot.style.background = '#22c55e';
    text.textContent = '✅ 카카오 연결됨 — 새 가입 신청 시 카카오톡으로 알림이 발송됩니다.';
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (testBtn) testBtn.style.display = 'inline-flex';
  } else if (appKey && kakaoInitialized) {
    dot.style.background = '#f59e0b';
    text.textContent = '⚠️ 앱 키는 설정됨 — 카카오 로그인이 필요합니다. (토큰 만료 또는 미연결)';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
  } else {
    dot.style.background = '#ef4444';
    text.textContent = appKey ? '❌ 카카오 SDK 초기화 실패 — 앱 키를 다시 확인해 주세요.' : '⭕ 카카오 앱 키를 입력하고 저장하세요.';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
  }
}

function saveKakaoAppKey() {
  const input = document.getElementById('kakao-app-key-input');
  const key = input ? input.value.trim() : '';
  if (!key) {
    showToast('앱 키를 입력해 주세요.', 'error');
    return;
  }
  localStorage.setItem('kakao_app_key', key);
  kakaoInitialized = false;
  initKakao();
  showToast('앱 키가 저장되었습니다. 이제 카카오 로그인을 진행해 주세요.', 'success');
  updateKakaoStatusUI();
}

function kakaoLogin() {
  if (!kakaoInitialized) {
    showToast('먼저 카카오 앱 키를 저장해 주세요.', 'error');
    return;
  }
  Kakao.Auth.login({
    scope: 'talk_message',
    success: function () {
      showToast('카카오 연결 성공! 이제 가입 알림이 자동 발송됩니다. 🎉', 'success');
      updateKakaoStatusUI();
    },
    fail: function (err) {
      console.error('Kakao login failed:', err);
      showToast('카카오 로그인 실패: ' + (err.error_description || JSON.stringify(err)), 'error');
    }
  });
}

function kakaoLogout() {
  if (!kakaoInitialized) return;
  Kakao.Auth.logout(function () {
    showToast('카카오 연결이 해제되었습니다.', 'success');
    updateKakaoStatusUI();
  });
}

async function sendKakaoNotification(user) {
  if (!isKakaoConnected()) return;
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  try {
    await Kakao.API.request({
      url: '/v2/api/talk/memo/default/send',
      data: {
        template_object: {
          object_type: 'text',
          text: [
            '🏠 힘찬매물 새 가입 신청',
            '─────────────────',
            `이름   : ${user.name}`,
            `아이디 : ${user.username}`,
            `연락처 : ${user.phone}`,
            `시간   : ${now}`,
            '─────────────────',
            '관리자 패널에서 승인해 주세요.'
          ].join('\n'),
          link: {
            web_url: 'https://wanjunsim3-droid.github.io/jumplist/',
            mobile_web_url: 'https://wanjunsim3-droid.github.io/jumplist/'
          }
        }
      }
    });
    console.log('[Kakao] 알림 발송 성공');
  } catch (err) {
    console.warn('[Kakao] 알림 발송 실패:', err);
    // 토큰 만료 시 재연결 유도
    if (err.result_code === -401) {
      updateKakaoStatusUI();
    }
  }
}

async function testKakaoNotification() {
  if (!isKakaoConnected()) {
    showToast('카카오 연결 후 테스트하세요.', 'error');
    return;
  }
  await sendKakaoNotification({
    name: '테스트 사용자',
    username: 'test_user',
    phone: '010-0000-0000'
  });
  showToast('테스트 메시지를 카카오톡으로 발송했습니다!', 'success');
}

// ============================================================
// Global Application State (Static Client-Side Mode)
let currentUser = null;
let allProperties = []; // Holds all 1837 property items in memory
let filteredProperties = []; // Holds currently filtered items
let properties = []; // Holds items for the current page
let currentPage = 1;
let currentLimit = 12;

// Mock database in localStorage
function getLocalUsers() {
  let users = localStorage.getItem('mock_users');
  if (!users) {
    // Default Admin account
    users = [
      {
        id: 1,
        username: 'admin',
        password: 'adminpassword123',
        name: '관리자',
        phone: '010-0000-0000',
        role: 'ADMIN',
        status: 'APPROVED',
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem('mock_users', JSON.stringify(users));
  } else {
    users = JSON.parse(users);
  }
  return users;
}

function saveLocalUsers(users) {
  localStorage.setItem('mock_users', JSON.stringify(users));
}

// Load App Initial State
document.addEventListener('DOMContentLoaded', async () => {
  // Check if session token exists (we use username as a simple session token in mock mode)
  const token = localStorage.getItem('token');
  const sessionUser = localStorage.getItem('session_user');
  
  // Pre-fetch all property data
  await fetchPropertiesJson();

  // Kakao SDK 초기화
  initKakao();

  if (token && sessionUser) {
    currentUser = JSON.parse(sessionUser);
    
    // Check if user status is updated in mock DB
    const users = getLocalUsers();
    const updatedUser = users.find(u => u.username === currentUser.username);
    if (updatedUser) {
      currentUser = updatedUser;
      localStorage.setItem('session_user', JSON.stringify(currentUser));
    }

    if (currentUser.role === 'ADMIN') {
      showView('admin');
    } else if (currentUser.status === 'APPROVED') {
      showView('dashboard');
    } else {
      showView('waiting');
    }
  } else {
    showView('auth');
  }

  // Bind Auth Events
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  
  // Navigation Events
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('admin-toggle-btn').addEventListener('click', () => showView('admin'));
  document.getElementById('dashboard-toggle-btn').addEventListener('click', () => showView('dashboard'));
  
  // Property CRUD form listener (Admin manual edit)
  document.getElementById('property-crud-form').addEventListener('submit', handlePropertySubmit);

  // Excel upload listener (Mock implementation)
  document.getElementById('excel-upload-form').addEventListener('submit', handleExcelUpload);
});

// Fetch properties.json static file
async function fetchPropertiesJson() {
  try {
    const res = await fetch('properties.json');
    if (res.ok) {
      allProperties = await res.json();
      console.log(`Loaded ${allProperties.length} properties statically.`);
    } else {
      showToast('매물 데이터를 불러오는데 실패했습니다 (properties.json 누락)', 'error');
    }
  } catch (error) {
    console.error('Error fetching properties.json:', error);
    showToast('매물 JSON 파일 통신 오류', 'error');
  }
}

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = toast.className.replace('show', '');
  }, 3500);
}

// Switch Auth tabs
function switchAuthTab(type) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (type === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
}

// Show specific view
function showView(viewId) {
  const views = ['auth-view', 'waiting-view', 'dashboard-view', 'admin-view'];
  views.forEach(v => {
    document.getElementById(v).style.display = v.startsWith(viewId) ? 'block' : 'none';
  });

  const mainNav = document.getElementById('main-nav');
  const adminToggle = document.getElementById('admin-toggle-btn');
  const dashToggle = document.getElementById('dashboard-toggle-btn');

  if (viewId === 'auth') {
    mainNav.style.display = 'none';
  } else {
    mainNav.style.display = 'flex';
    document.getElementById('user-display-name').innerText = currentUser ? currentUser.name : '';
    document.getElementById('user-role-badge').innerText = currentUser && currentUser.role === 'ADMIN' ? '관리자' : '회원';

    if (currentUser && currentUser.role === 'ADMIN') {
      adminToggle.style.display = viewId === 'admin' ? 'none' : 'inline-flex';
      dashToggle.style.display = viewId === 'dashboard' ? 'none' : 'inline-flex';
    } else {
      adminToggle.style.display = 'none';
      dashToggle.style.display = 'none';
    }
  }

  if (viewId === 'dashboard') {
    loadRegions();
    loadProperties(1);
  } else if (viewId === 'admin') {
    loadAdminUsers();
    // 관리자 패널 진입 시 카카오 상태 갱신
    setTimeout(updateKakaoStatusUI, 100);
  }
}

// Handle Login (Mock)
function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('login-username').value.trim();
  const passwordInput = document.getElementById('login-password').value;

  const users = getLocalUsers();
  const user = users.find(u => u.username === usernameInput);

  if (!user) {
    showToast('존재하지 않는 회원입니다.', 'error');
    return;
  }

  if (user.password !== passwordInput) {
    showToast('비밀번호가 일치하지 않습니다.', 'error');
    return;
  }

  // Setup session mock token
  currentUser = user;
  localStorage.setItem('token', 'mock_token_' + user.username);
  localStorage.setItem('session_user', JSON.stringify(user));

  showToast('성공적으로 로그인되었습니다.', 'success');

  if (currentUser.role === 'ADMIN') {
    showView('admin');
  } else if (currentUser.status === 'APPROVED') {
    showView('dashboard');
  } else {
    showView('waiting');
  }
}

// Handle Register (Mock)
function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const name = document.getElementById('register-name').value.trim();
  const phone = document.getElementById('register-phone').value.trim();

  const users = getLocalUsers();
  if (users.find(u => u.username === username)) {
    showToast('이미 존재하는 아이디입니다.', 'error');
    return;
  }

  const newUser = {
    id: users.length + 1,
    username,
    password,
    name,
    phone,
    role: 'USER',
    status: 'PENDING',
    created_at: new Date().toISOString()
  };

  users.push(newUser);
  saveLocalUsers(users);

  // 카카오톡 알림 발송 (관리자에게 나에게 보내기)
  sendKakaoNotification(newUser);

  showToast('회원가입 신청이 완료되었습니다. 관리자 승인을 대기해 주세요.', 'success');
  switchAuthTab('login');
  document.getElementById('register-form').reset();
}

// Logout Action
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('session_user');
  currentUser = null;
  showView('auth');
}

// Load unique regions dynamically from allProperties
function loadRegions() {
  const select = document.getElementById('filter-region');
  const currentValue = select.value;
  
  const regionsSet = new Set();
  allProperties.forEach(item => {
    if (!item.address) return;
    const addr = item.address.trim();
    const parts = addr.split(/\s+/);
    if (parts.length > 0) {
      const first = parts[0];
      const second = parts[1] || '';
      
      if (second && (second.endsWith('구') || second.endsWith('시') || second.endsWith('군'))) {
        regionsSet.add(`${first} ${second}`);
      } else {
        if (first.endsWith('구') || first.endsWith('시') || first.endsWith('군') || first === '서울' || first === '경기') {
          regionsSet.add(first);
        } else {
          regionsSet.add(first);
        }
      }
    }
  });

  const sortedRegions = Array.from(regionsSet).filter(r => r.length > 1).sort();
  select.innerHTML = '<option value="">전체 지역</option>';
  sortedRegions.forEach(reg => {
    select.innerHTML += `<option value="${reg}">${reg}</option>`;
  });
  select.value = currentValue;
}

// Search and Filter Properties (Client-Side In-Memory Filtering)
function loadProperties(page = 1) {
  currentPage = page;
  const search = document.getElementById('filter-search').value.toLowerCase().trim();
  const region = document.getElementById('filter-region').value;
  const sheet = document.getElementById('filter-sheet').value;
  const minArea = parseFloat(document.getElementById('filter-min-area').value) || 0;
  const maxArea = parseFloat(document.getElementById('filter-max-area').value) || Infinity;
  const minDeposit = parseInt(document.getElementById('filter-min-deposit').value) || 0;
  const maxDeposit = parseInt(document.getElementById('filter-max-deposit').value) || Infinity;
  const minRent = parseInt(document.getElementById('filter-min-rent').value) || 0;
  const maxRent = parseInt(document.getElementById('filter-max-rent').value) || Infinity;
  const minPremium = parseInt(document.getElementById('filter-min-premium').value) || 0;
  const maxPremium = parseInt(document.getElementById('filter-max-premium').value) || Infinity;

  // Filter in memory
  filteredProperties = allProperties.filter(item => {
    // 1. Keyword search (Address, Shop name, Note)
    if (search) {
      const addrMatch = item.address && item.address.toLowerCase().includes(search);
      const nameMatch = item.shop_name && item.shop_name.toLowerCase().includes(search);
      const noteMatch = item.note && item.note.toLowerCase().includes(search);
      if (!addrMatch && !nameMatch && !noteMatch) return false;
    }

    // 2. Region prefix match
    if (region && (!item.address || !item.address.startsWith(region))) return false;

    // 3. Sheet match
    if (sheet && item.sheet_name !== sheet) return false;

    // 4. Area range
    const area = item.area || 0;
    if (area < minArea || area > maxArea) return false;

    // 5. Deposit range
    const deposit = item.deposit || 0;
    if (deposit < minDeposit || deposit > maxDeposit) return false;

    // 6. Rent range
    const rent = item.rent || 0;
    if (rent < minRent || rent > maxRent) return false;

    // 7. Premium range
    const premium = item.premium || 0;
    if (premium < minPremium || premium > maxPremium) return false;

    return true;
  });

  // Calculate pages
  const totalCount = filteredProperties.length;
  document.getElementById('total-properties-count').innerText = totalCount;
  const totalPages = Math.ceil(totalCount / currentLimit);

  // Paginate items slice
  const offset = (currentPage - 1) * currentLimit;
  properties = filteredProperties.slice(offset, offset + currentLimit);

  renderPropertyCards(properties);
  renderPagination(totalPages, currentPage);
}

// Render cards
function renderPropertyCards(data) {
  const container = document.getElementById('properties-list');
  if (data.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-secondary);">
      <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i>
      <p>검색 결과와 매칭되는 매물이 없습니다.</p>
    </div>`;
    return;
  }

  container.innerHTML = data.map(item => {
    const title = item.shop_name ? item.shop_name : (item.address ? item.address.split(' ').slice(1, 3).join(' ') + ' 매물' : '매물');
    return `
      <div class="property-card glass-panel" onclick="openPropertyModal(${item.id})">
        <div class="property-header">
          <div class="property-shop">${title}</div>
          <span class="property-sheet-badge">${item.sheet_name || '매물'}</span>
        </div>
        <div class="property-address"><i class="fa-solid fa-location-dot" style="margin-right: 5px;"></i> ${item.address}</div>
        
        <div class="property-details">
          <div class="detail-item">
            <span class="detail-label">보증금</span>
            <span class="detail-value price">${item.deposit ? item.deposit.toLocaleString() + '만' : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">임대료</span>
            <span class="detail-value price">${item.rent ? item.rent.toLocaleString() + '만' : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">평수</span>
            <span class="detail-value">${item.area ? item.area.toFixed(1) + '평' : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">층수</span>
            <span class="detail-value">${item.floor || '-'}</span>
          </div>
        </div>

        <div class="property-note">
          ${item.note ? (item.note.length > 50 ? item.note.substring(0, 50) + '...' : item.note) : '비고 없음'}
        </div>

        <div class="property-footer">
          ${item.map_url ? 
            `<a href="${item.map_url}" target="_blank" class="map-link" onclick="event.stopPropagation()">
              <i class="fa-solid fa-map-location-dot"></i> 지도 바로가기
             </a>` : '<span></span>'
          }
          <i class="fa-solid fa-chevron-right" style="color: var(--text-muted); font-size: 0.85rem;"></i>
        </div>
      </div>
    `;
  }).join('');
}

// Pagination controls renderer
function renderPagination(totalPages, activePage) {
  const container = document.getElementById('properties-pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="btn btn-secondary" ${activePage === 1 ? 'disabled' : ''} onclick="loadProperties(${activePage - 1})">이전</button>`;
  
  const startPage = Math.max(1, activePage - 2);
  const endPage = Math.min(totalPages, activePage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="btn ${i === activePage ? 'btn-primary' : 'btn-secondary'}" onclick="loadProperties(${i})">${i}</button>`;
  }
  
  html += `<button class="btn btn-secondary" ${activePage === totalPages ? 'disabled' : ''} onclick="loadProperties(${activePage + 1})">다음</button>`;
  container.innerHTML = html;
}

// Reset filters
function resetFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-region').value = '';
  document.getElementById('filter-sheet').value = '';
  document.getElementById('filter-min-area').value = '';
  document.getElementById('filter-max-area').value = '';
  document.getElementById('filter-min-deposit').value = '';
  document.getElementById('filter-max-deposit').value = '';
  document.getElementById('filter-min-rent').value = '';
  document.getElementById('filter-max-rent').value = '';
  document.getElementById('filter-min-premium').value = '';
  document.getElementById('filter-max-premium').value = '';
  loadProperties(1);
}

// Details Modal
function openPropertyModal(id) {
  const prop = allProperties.find(p => p.id === id);
  if (!prop) return;

  document.getElementById('modal-shop-name').innerText = prop.shop_name || '매물 상세 정보';
  document.getElementById('modal-address').innerText = prop.address;
  document.getElementById('modal-floor').innerText = prop.floor || '-';
  document.getElementById('modal-area').innerText = prop.area ? prop.area.toFixed(2) + ' 평' : '-';
  document.getElementById('modal-maintenance').innerText = prop.maintenance ? prop.maintenance.toLocaleString() + ' 만원' : '-';
  document.getElementById('modal-deposit').innerText = prop.deposit ? prop.deposit.toLocaleString() + ' 만원' : '-';
  document.getElementById('modal-rent').innerText = prop.rent ? prop.rent.toLocaleString() + ' 만원' : '-';
  document.getElementById('modal-premium').innerText = prop.premium ? prop.premium.toLocaleString() + ' 만원' : '-';
  document.getElementById('modal-note').innerText = prop.note || '비고 없음';
  document.getElementById('modal-sheet-badge').innerText = prop.sheet_name || '수동';

  const mapBtn = document.getElementById('modal-map-btn');
  if (prop.map_url) {
    mapBtn.href = prop.map_url;
    mapBtn.style.display = 'inline-flex';
  } else {
    mapBtn.style.display = 'none';
  }

  const editBtn = document.getElementById('modal-edit-btn');
  if (currentUser && currentUser.role === 'ADMIN') {
    editBtn.style.display = 'inline-flex';
    editBtn.onclick = () => {
      closePropertyModal();
      showView('admin');
      populateCrudForm(prop);
    };
  } else {
    editBtn.style.display = 'none';
  }

  document.getElementById('property-modal').classList.add('active');
}

function closePropertyModal() {
  document.getElementById('property-modal').classList.remove('active');
}

// --- ADMIN MOCK HANDLERS ---

// Member list (Admin panel)
let currentMemberModalId = null;

function loadAdminUsers() {
  const allUsers = getLocalUsers();
  const searchVal = (document.getElementById('member-search')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('member-status-filter')?.value || '';

  // 통계 업데이트
  const approved = allUsers.filter(u => u.status === 'APPROVED').length;
  const pending  = allUsers.filter(u => u.status === 'PENDING').length;
  const rejected = allUsers.filter(u => u.status === 'REJECTED').length;
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-total',    allUsers.length);
  setEl('stat-approved', approved);
  setEl('stat-pending',  pending);
  setEl('stat-rejected', rejected);

  // 필터링
  const users = allUsers.filter(u => {
    const matchSearch = !searchVal ||
      u.name.toLowerCase().includes(searchVal) ||
      u.username.toLowerCase().includes(searchVal) ||
      (u.phone || '').includes(searchVal);
    const matchStatus = !statusFilter || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const listContainer = document.getElementById('admin-users-list');
  const emptyMsg = document.getElementById('member-empty-msg');

  if (users.length === 0) {
    listContainer.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  listContainer.innerHTML = users.map(user => {
    const isSelf = user.username === currentUser.username;
    let actionButtons = '';
    if (!isSelf) {
      if (user.status !== 'APPROVED') {
        actionButtons += `<button class="btn btn-success" style="padding: 5px 10px; font-size: 0.75rem;" onclick="event.stopPropagation(); updateUserStatus(${user.id}, 'APPROVED')"><i class="fa-solid fa-check"></i> 승인</button>`;
      }
      if (user.status !== 'REJECTED') {
        actionButtons += `<button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.75rem; margin-left: 4px;" onclick="event.stopPropagation(); updateUserStatus(${user.id}, 'REJECTED')"><i class="fa-solid fa-xmark"></i> 거절</button>`;
      }
    } else {
      actionButtons = `<span style="font-size: 0.75rem; color: var(--text-muted);">본인</span>`;
    }

    let statusClass = 'status-pending';
    let statusLabel = '대기';
    if (user.status === 'APPROVED') { statusClass = 'status-approved'; statusLabel = '승인'; }
    if (user.status === 'REJECTED') { statusClass = 'status-rejected'; statusLabel = '거절'; }

    const dateStr = user.created_at
      ? new Date(user.created_at).toLocaleDateString('ko-KR')
      : '-';

    return `
      <tr class="member-row" onclick="openMemberModal(${user.id})" style="cursor: pointer;" title="클릭하여 상세 보기">
        <td>
          <strong>${user.name}</strong>
          ${user.role === 'ADMIN' ? '<span class="user-badge" style="margin-left:4px;">관리자</span>' : ''}
        </td>
        <td style="font-family: monospace; font-size: 0.9rem;">${user.username}</td>
        <td>${user.phone || '-'}</td>
        <td style="font-size: 0.85rem; color: var(--text-secondary);">${dateStr}</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;"
            onclick="event.stopPropagation(); openMemberModal(${user.id})">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
        <td style="display: flex; gap: 4px; flex-wrap: wrap;">${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

// 회원 상세 모달 열기
function openMemberModal(userId) {
  const users = getLocalUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;

  currentMemberModalId = userId;
  const isSelf = user.username === currentUser.username;

  // 아바타: 이름 첫 글자
  const avatar = document.getElementById('member-modal-avatar');
  if (avatar) avatar.textContent = user.name ? user.name.charAt(0) : '?';

  document.getElementById('member-modal-name').textContent = user.name;
  document.getElementById('member-modal-username').textContent = user.username;
  document.getElementById('member-modal-phone').textContent = user.phone || '-';
  document.getElementById('member-modal-date').textContent = user.created_at
    ? new Date(user.created_at).toLocaleString('ko-KR')
    : '-';
  document.getElementById('member-modal-role').textContent = user.role === 'ADMIN' ? '관리자 (ADMIN)' : '일반 회원 (USER)';

  // 상태 배지
  const statusBadge = document.getElementById('member-modal-status-badge');
  statusBadge.className = 'status-badge';
  if (user.status === 'APPROVED') { statusBadge.classList.add('status-approved'); statusBadge.textContent = '승인 완료'; }
  else if (user.status === 'REJECTED') { statusBadge.classList.add('status-rejected'); statusBadge.textContent = '거절됨'; }
  else { statusBadge.classList.add('status-pending'); statusBadge.textContent = '승인 대기'; }

  // 권한 배지
  const roleBadge = document.getElementById('member-modal-role-badge');
  roleBadge.textContent = user.role === 'ADMIN' ? '관리자' : '회원';

  // 버튼 표시
  const actions = document.getElementById('member-modal-actions');
  const selfNote = document.getElementById('member-modal-self-note');
  const approveBtn = document.getElementById('member-modal-approve-btn');
  const rejectBtn = document.getElementById('member-modal-reject-btn');

  if (isSelf) {
    if (actions) actions.style.display = 'none';
    if (selfNote) selfNote.style.display = 'block';
  } else {
    if (actions) actions.style.display = 'flex';
    if (selfNote) selfNote.style.display = 'none';
    if (approveBtn) approveBtn.style.display = user.status !== 'APPROVED' ? 'flex' : 'none';
    if (rejectBtn) rejectBtn.style.display = user.status !== 'REJECTED' ? 'flex' : 'none';
  }

  document.getElementById('member-modal').classList.add('active');
}

function closeMemberModal() {
  document.getElementById('member-modal').classList.remove('active');
  currentMemberModalId = null;
}

function memberModalAction(status) {
  if (!currentMemberModalId) return;
  updateUserStatus(currentMemberModalId, status);
  closeMemberModal();
}

// Update User Approval status
function updateUserStatus(userId, status) {
  const users = getLocalUsers();
  const user = users.find(u => u.id === userId);

  if (user) {
    user.status = status;
    saveLocalUsers(users);
    const label = status === 'APPROVED' ? '승인' : status === 'REJECTED' ? '거절' : status;
    showToast(`${user.name} 회원이 ${label} 처리되었습니다.`, 'success');
    loadAdminUsers();
  } else {
    showToast('해당 사용자를 찾을 수 없습니다.', 'error');
  }
}

// Add/Edit Property (Admin)
function handlePropertySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('crud-property-id').value;
  const payload = {
    address: document.getElementById('crud-address').value,
    shop_name: document.getElementById('crud-shop-name').value,
    map_url: document.getElementById('crud-map-url').value,
    floor: document.getElementById('crud-floor').value,
    area: parseFloat(document.getElementById('crud-area').value) || 0,
    deposit: parseInt(document.getElementById('crud-deposit').value) || 0,
    rent: parseInt(document.getElementById('crud-rent').value) || 0,
    premium: parseInt(document.getElementById('crud-premium').value) || 0,
    maintenance: parseInt(document.getElementById('crud-maintenance').value) || 0,
    note: document.getElementById('crud-note').value
  };

  const cleanAddr = payload.address.replace(/\*공실/g, '').replace(/\*/g, '').trim();
  if (!payload.map_url && cleanAddr) {
    payload.map_url = `https://map.naver.com/p/search/${encodeURIComponent(cleanAddr)}`;
  }

  if (id) {
    // Edit existing
    const index = allProperties.findIndex(p => p.id === parseInt(id));
    if (index !== -1) {
      allProperties[index] = { ...allProperties[index], ...payload };
      showToast('매물이 성공적으로 수정되었습니다 (브라우저 메모리)', 'success');
    }
  } else {
    // Add new
    const newProp = {
      id: allProperties.length + 10000,
      ...payload,
      sheet_name: '수동 등록'
    };
    allProperties.unshift(newProp);
    showToast('매물이 성공적으로 추가되었습니다 (브라우저 메모리)', 'success');
  }
  
  clearCrudForm();
}

function populateCrudForm(prop) {
  document.getElementById('crud-property-id').value = prop.id;
  document.getElementById('crud-address').value = prop.address || '';
  document.getElementById('crud-shop-name').value = prop.shop_name || '';
  document.getElementById('crud-map-url').value = prop.map_url || '';
  document.getElementById('crud-floor').value = prop.floor || '';
  document.getElementById('crud-area').value = prop.area || '';
  document.getElementById('crud-deposit').value = prop.deposit || '';
  document.getElementById('crud-rent').value = prop.rent || '';
  document.getElementById('crud-premium').value = prop.premium || '';
  document.getElementById('crud-maintenance').value = prop.maintenance || '';
  document.getElementById('crud-note').value = prop.note || '';
  
  document.getElementById('crud-submit-btn').innerText = '매물 수정';
  document.getElementById('crud-submit-btn').className = 'btn btn-primary';
}

function clearCrudForm() {
  document.getElementById('property-crud-form').reset();
  document.getElementById('crud-property-id').value = '';
  document.getElementById('crud-submit-btn').innerText = '매물 등록';
  document.getElementById('crud-submit-btn').className = 'btn btn-success';
}

// Upload Excel Mock (Since we are static, tell the admin that local script builds the static file)
function handleExcelUpload(e) {
  e.preventDefault();
  showToast('정적 게시(GitHub Pages) 모드에서는 빌드 스크립트를 실행해 엑셀을 업데이트해야 합니다. 로컬에서 node build-json.js를 실행해 주세요.', 'error');
}
