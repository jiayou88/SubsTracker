// 订阅续期通知网站 - 基于CloudFlare Workers (完全优化版 + 修复自动通知问题)

// ==================== 常量定义 ====================
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// ==================== 时区处理工具函数 ====================
function getCurrentTimeInTimezone(timezone = 'UTC') {
  try {
    return new Date();
  } catch (error) {
    console.error(`时区转换错误: ${error.message}`);
    return new Date();
  }
}

function getTimezoneDateParts(date, timezone = 'UTC') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const pick = (type) => {
      const part = parts.find(item => item.type === type);
      return part ? Number(part.value) : 0;
    };
    return {
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
      second: pick('second')
    };
  } catch (error) {
    console.error(`解析时区(${timezone})失败: ${error.message}`);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }
}

function getTimezoneMidnightTimestamp(date, timezone = 'UTC') {
  const { year, month, day } = getTimezoneDateParts(date, timezone);
  return Date.UTC(year, month - 1, day, 0, 0, 0);
}

function formatTimeInTimezone(time, timezone = 'UTC', format = 'full') {
  try {
    const date = new Date(time);
    
    if (format === 'date') {
      return date.toLocaleDateString('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } else if (format === 'datetime') {
      return date.toLocaleString('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } else {
      return date.toLocaleString('zh-CN', { timeZone: timezone });
    }
  } catch (error) {
    console.error(`时间格式化错误: ${error.message}`);
    return new Date(time).toISOString();
  }
}

function getTimezoneOffset(timezone = 'UTC') {
  try {
    const now = new Date();
    const { year, month, day, hour, minute, second } = getTimezoneDateParts(now, timezone);
    const zonedTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((zonedTimestamp - now.getTime()) / MS_PER_HOUR);
  } catch (error) {
    console.error(`获取时区偏移量错误: ${error.message}`);
    return 0;
  }
}

function formatTimezoneDisplay(timezone = 'UTC') {
  try {
    const offset = getTimezoneOffset(timezone);
    const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;
    
    const timezoneNames = {
      'UTC': '世界标准时间',
      'Asia/Shanghai': '中国标准时间',
      'Asia/Hong_Kong': '香港时间',
      'Asia/Taipei': '台北时间',
      'Asia/Singapore': '新加坡时间',
      'Asia/Tokyo': '日本时间',
      'Asia/Seoul': '韩国时间',
      'America/New_York': '美国东部时间',
      'America/Los_Angeles': '美国太平洋时间',
      'America/Chicago': '美国中部时间',
      'America/Denver': '美国山地时间',
      'Europe/London': '英国时间',
      'Europe/Paris': '巴黎时间',
      'Europe/Berlin': '柏林时间',
      'Europe/Moscow': '莫斯科时间',
      'Australia/Sydney': '悉尼时间',
      'Australia/Melbourne': '墨尔本时间',
      'Pacific/Auckland': '奥克兰时间'
    };
    
    const timezoneName = timezoneNames[timezone] || timezone;
    return `${timezoneName} (UTC${offsetStr})`;
  } catch (error) {
    console.error('格式化时区显示失败:', error);
    return timezone;
  }
}

// ==================== 农历转换工具函数 ====================
const lunarCalendar = {
  lunarInfo: [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x14a38, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x1a978, 0x16aa0, 0x0a6c0,
    0x0aa60, 0x16d63, 0x0d260, 0x0d950, 0x0d554, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7,
    0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0,
    0x15176, 0x052b0, 0x0a930, 0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0,
    0x0d260, 0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x1a4bb, 0x0a4d0, 0x0d0b0,
    0x0d250
  ],

  gan: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
  zhi: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],
  months: ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'],
  days: ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
         '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
         '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'],

  lunarYearDays: function(year) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (this.lunarInfo[year - 1900] & i) ? 1 : 0;
    }
    return sum + this.leapDays(year);
  },

  leapDays: function(year) {
    if (this.leapMonth(year)) {
      return (this.lunarInfo[year - 1900] & 0x10000) ? 30 : 29;
    }
    return 0;
  },

  leapMonth: function(year) {
    return this.lunarInfo[year - 1900] & 0xf;
  },

  monthDays: function(year, month) {
    return (this.lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
  },

  solar2lunar: function(year, month, day) {
    if (year < 1900 || year > 2100) return null;

    const baseDate = Date.UTC(1900, 0, 31);
    const objDate = Date.UTC(year, month - 1, day);
    let offset = Math.round((objDate - baseDate) / 86400000);

    let temp = 0;
    let lunarYear = 1900;

    for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
      temp = this.lunarYearDays(lunarYear);
      offset -= temp;
    }

    if (offset < 0) {
      offset += temp;
      lunarYear--;
    }

    let lunarMonth = 1;
    let leap = this.leapMonth(lunarYear);
    let isLeap = false;

    for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
      if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
        --lunarMonth;
        isLeap = true;
        temp = this.leapDays(lunarYear);
      } else {
        temp = this.monthDays(lunarYear, lunarMonth);
      }

      if (isLeap && lunarMonth === (leap + 1)) isLeap = false;
      offset -= temp;
    }

    if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
      if (isLeap) {
        isLeap = false;
      } else {
        isLeap = true;
        --lunarMonth;
      }
    }

    if (offset < 0) {
      offset += temp;
      --lunarMonth;
    }

    const lunarDay = offset + 1;

    const ganIndex = (lunarYear - 4) % 10;
    const zhiIndex = (lunarYear - 4) % 12;
    const yearStr = this.gan[ganIndex] + this.zhi[zhiIndex] + '年';
    const monthStr = (isLeap ? '闰' : '') + this.months[lunarMonth - 1] + '月';
    const dayStr = this.days[lunarDay - 1];

    return {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeap,
      yearStr: yearStr,
      monthStr: monthStr,
      dayStr: dayStr,
      fullStr: yearStr + monthStr + dayStr
    };
  }
};

// ==================== 农历业务逻辑 ====================
const lunarBiz = {
  addLunarPeriod(lunar, periodValue, periodUnit) {
    let { year, month, day, isLeap } = lunar;
    
    if (periodUnit === 'year') {
      year += periodValue;
      const leap = lunarCalendar.leapMonth(year);
      if (isLeap && leap === month) {
        isLeap = true;
      } else {
        isLeap = false;
      }
    } else if (periodUnit === 'month') {
      let totalMonths = (year - 1900) * 12 + (month - 1) + periodValue;
      year = Math.floor(totalMonths / 12) + 1900;
      month = (totalMonths % 12) + 1;
      const leap = lunarCalendar.leapMonth(year);
      if (isLeap && leap === month) {
        isLeap = true;
      } else {
        isLeap = false;
      }
    } else if (periodUnit === 'day') {
      const solar = this.lunar2solar(lunar);
      const date = new Date(solar.year, solar.month - 1, solar.day + periodValue);
      return lunarCalendar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
    
    let maxDay = isLeap
      ? lunarCalendar.leapDays(year)
      : lunarCalendar.monthDays(year, month);
    let targetDay = Math.min(day, maxDay);
    
    while (targetDay > 0) {
      let solar = this.lunar2solar({ year, month, day: targetDay, isLeap });
      if (solar) {
        return { year, month, day: targetDay, isLeap };
      }
      targetDay--;
    }
    return { year, month, day, isLeap };
  },

  lunar2solar(lunar) {
    for (let y = lunar.year - 1; y <= lunar.year + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        for (let d = 1; d <= 31; d++) {
          const date = new Date(y, m - 1, d);
          if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) continue;
          const l = lunarCalendar.solar2lunar(y, m, d);
          if (l && l.year === lunar.year && l.month === lunar.month && 
              l.day === lunar.day && l.isLeap === lunar.isLeap) {
            return { year: y, month: m, day: d };
          }
        }
      }
    }
    return null;
  },

  daysToLunar(lunar) {
    const solar = this.lunar2solar(lunar);
    const date = new Date(solar.year, solar.month - 1, solar.day);
    const now = new Date();
    return Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  }
};

// ==================== 主题资源 ====================
const themeResources = `
<style>
  /* === 全局暗黑模式核心变量与覆盖 === */
  :root {
    --dark-bg-primary: #111827;
    --dark-bg-secondary: #1f2937;
    --dark-border: #374151;
    --dark-text-main: #f9fafb;
    --dark-text-muted: #9ca3af;
  }
  html.dark body { background-color: var(--dark-bg-primary); color: var(--dark-text-muted); }
  html.dark .bg-white { background-color: var(--dark-bg-secondary) !important; color: var(--dark-text-main); }
  html.dark .bg-gray-50 { background-color: var(--dark-bg-primary) !important; }
  html.dark .bg-gray-100 { background-color: var(--dark-border) !important; }
  html.dark .shadow-md, html.dark .shadow-lg, html.dark .shadow-xl { 
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3); 
  }
  html.dark .text-gray-900, html.dark .text-gray-800 { color: var(--dark-text-main) !important; }
  html.dark .text-gray-700 { color: #d1d5db !important; }
  html.dark .text-gray-600, html.dark .text-gray-500 { color: var(--dark-text-muted) !important; }
  html.dark .text-indigo-600 { color: #818cf8 !important; }
  html.dark .border-gray-200, html.dark .border-gray-300 { border-color: var(--dark-border) !important; }
  html.dark .divide-y > :not([hidden]) ~ :not([hidden]) { border-color: var(--dark-border) !important; }
  html.dark input, html.dark select, html.dark textarea {
    background-color: #374151 !important;
    border-color: #4b5563 !important;
    color: white !important;
  }
  html.dark input::placeholder, html.dark textarea::placeholder { color: #9ca3af; }
  html.dark input:focus, html.dark select:focus, html.dark textarea:focus {
    border-color: #818cf8 !important;
    background-color: #4b5563 !important;
  }
  html.dark nav { background-color: var(--dark-bg-secondary) !important; border-bottom: 1px solid var(--dark-border); }
  html.dark thead {
    background-color: #111827 !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  html.dark thead th {
    color: #f9fafb !important;
    background-color: #111827 !important;
    border-bottom: 1px solid #4b5563 !important;
    letter-spacing: 0.08em;
  }
  html.dark tbody tr:hover { background-color: #374151 !important; }
  html.dark tbody tr.bg-gray-100 { background-color: #374151 !important; }
  
  @media (max-width: 767px) {
    html.dark .responsive-table td:before {
      color: #e5e7eb !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    html.dark .responsive-table tr {
      border-color: #374151 !important;
      background-color: #1f2937 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
    }
    html.dark .responsive-table td {
      border-bottom-color: #374151 !important;
    }
    html.dark .td-content-wrapper {
        color: #f3f4f6;
    }
  }
</style>
<script>
  (function() {
    function applyTheme(mode) {
      const html = document.documentElement;
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      if (mode === 'dark' || (mode === 'system' && isSystemDark)) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }

    const savedTheme = localStorage.getItem('themeMode') || 'system';
    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const currentMode = localStorage.getItem('themeMode') || 'system';
      if (currentMode === 'system') {
        applyTheme('system');
      }
    });

    window.addEventListener('load', async () => {
      if (window.location.pathname.startsWith('/admin')) {
        try {
          const res = await fetch('/api/config');
          const config = await res.json();
          if (config.THEME_MODE && config.THEME_MODE !== localStorage.getItem('themeMode')) {
            localStorage.setItem('themeMode', config.THEME_MODE);
            applyTheme(config.THEME_MODE);
            const select = document.getElementById('themeModeSelect');
            if (select) select.value = config.THEME_MODE;
          }
        } catch(e) {}
      }
    });
    
    window.updateAppTheme = function(mode) {
      localStorage.setItem('themeMode', mode);
      applyTheme(mode);
    };
  })();
</script>
`;

// ==================== HTML模板 ====================
const loginPage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>订阅管理系统</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  ${themeResources}
  <style>
    .login-container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
    .login-box { backdrop-filter: blur(8px); background-color: rgba(255, 255, 255, 0.9); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15); }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: all 0.3s; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .input-field { transition: all 0.3s; border: 1px solid #e2e8f0; }
    .input-field:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.25); }
    html.dark .login-container { background: linear-gradient(135deg, #3b4cc4 0%, #4a2b6b 100%); }
    html.dark .login-box { background-color: rgba(17, 24, 39, 0.95); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); }
    html.dark .login-box .text-gray-800 { color: #f3f4f6; }
    html.dark .login-box .text-gray-600, html.dark .login-box .text-gray-700 { color: #cbd5e1; }
  </style>
</head>
<body class="login-container flex items-center justify-center">
  <div class="login-box p-8 rounded-xl w-full max-w-md">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-gray-800"><i class="fas fa-calendar-check mr-2"></i>订阅管理系统</h1>
      <p class="text-gray-600 mt-2">登录管理您的订阅提醒</p>
    </div>
    
    <form id="loginForm" class="space-y-6">
      <div>
        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">
          <i class="fas fa-user mr-2"></i>用户名
        </label>
        <input type="text" id="username" name="username" required
          class="input-field w-full px-4 py-3 rounded-lg text-gray-700 focus:outline-none">
      </div>
      
      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
          <i class="fas fa-lock mr-2"></i>密码
        </label>
        <input type="password" id="password" name="password" required
          class="input-field w-full px-4 py-3 rounded-lg text-gray-700 focus:outline-none">
      </div>
      
      <button type="submit" 
        class="btn-primary w-full py-3 rounded-lg text-white font-medium focus:outline-none">
        <i class="fas fa-sign-in-alt mr-2"></i>登录
      </button>
      
      <div id="errorMsg" class="text-red-500 text-center"></div>
    </form>
  </div>
  
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      const button = e.target.querySelector('button');
      const originalContent = button.innerHTML;
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>登录中...';
      button.disabled = true;
      
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
          window.location.href = '/admin';
        } else {
          document.getElementById('errorMsg').textContent = result.message || '用户名或密码错误';
          button.innerHTML = originalContent;
          button.disabled = false;
        }
      } catch (error) {
        document.getElementById('errorMsg').textContent = '发生错误，请稍后再试';
        button.innerHTML = originalContent;
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

const adminPage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>订阅管理系统</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  ${themeResources}
  <style>
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: all 0.3s; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .btn-danger { background: linear-gradient(135deg, #f87171 0%, #dc2626 100%); transition: all 0.3s; }
    .btn-danger:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .btn-success { background: linear-gradient(135deg, #34d399 0%, #059669 100%); transition: all 0.3s; }
    .btn-success:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .btn-warning { background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); transition: all 0.3s; }
    .btn-warning:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .btn-info { background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%); transition: all 0.3s; }
    .btn-info:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .table-container { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .modal-container { backdrop-filter: blur(8px); }
    .readonly-input { background-color: #f8fafc; border-color: #e2e8f0; cursor: not-allowed; }
    .error-message { font-size: 0.875rem; margin-top: 0.25rem; display: none; }
    .error-message.show { display: block; }

    .hover-container { position: relative; width: 100%; }
    .hover-text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; transition: all 0.3s ease; display: block; }
    .hover-text:hover { color: #3b82f6; }
    .hover-tooltip {
      position: fixed; z-index: 9999; background: #1f2937; color: white; padding: 10px 14px; border-radius: 8px;
      font-size: 0.875rem; max-width: 320px; word-wrap: break-word; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      opacity: 0; visibility: hidden; transition: all 0.3s ease; transform: translateY(-10px);
      white-space: normal; pointer-events: none; line-height: 1.4;
    }
    .hover-tooltip.show { opacity: 1; visibility: visible; transform: translateY(0); }
    .hover-tooltip::before {
      content: ''; position: absolute; top: -6px; left: 20px;
      border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid #1f2937;
    }
    .hover-tooltip.tooltip-above::before {
      top: auto; bottom: -6px; border-bottom: none; border-top: 6px solid #1f2937;
    }

    .lunar-display { font-size: 0.75rem; color: #6366f1; margin-top: 2px; opacity: 0; transition: opacity 0.3s ease; }
    .lunar-display.show { opacity: 1; }
    
    .custom-date-picker {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15); border-radius: 12px;
      width: 100%; max-width: 380px; min-width: 300px; 
    }
    
    .custom-date-picker .calendar-day {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 100%; height: auto; aspect-ratio: 0.85; min-height: 45px;
      border-radius: 6px; cursor: pointer; transition: all 0.2s ease;
      position: relative; padding: 2px; font-size: 13px;
    }
    
    .custom-dropdown-wrapper { position: relative; width: 100%; }
    .custom-dropdown-list {
      position: absolute; top: 100%; left: 0; right: 0; background: white;
      border: 1px solid #e2e8f0; border-radius: 0.5rem; margin-top: 4px;
      max-height: 200px; overflow-y: auto; z-index: 60; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      display: none;
    }
    .custom-dropdown-list.show { display: block; }
    .dropdown-item {
      padding: 10px 12px; font-size: 14px; color: #374151;
      cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background-color 0.2s;
    }
    .dropdown-item:last-child { border-bottom: none; }
    .dropdown-item:hover, .dropdown-item:active { background-color: #f3f4f6; color: #4f46e5; }

    .custom-date-picker .calendar-day:hover { background-color: #e0e7ff; transform: scale(1.05); }
    .custom-date-picker .calendar-day.selected { background-color: #6366f1; color: white; transform: scale(1.1); box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3); }
    .custom-date-picker .calendar-day.today { background-color: #e0e7ff; color: #6366f1; font-weight: 600; border: 2px solid #6366f1; }
    .custom-date-picker .calendar-day.other-month { color: #d1d5db; }
    .custom-date-picker .calendar-day .lunar-text { font-size: 11px; line-height: 1.2; margin-top: 3px; opacity: 0.85; text-align: center; font-weight: 500; }
    .custom-date-picker .calendar-day.selected .lunar-text { color: rgba(255, 255, 255, 0.9); }
    .custom-date-picker .calendar-day.today .lunar-text { color: #6366f1; }
    
    .month-option, .year-option { transition: all 0.2s ease; border: 1px solid transparent; }
    .month-option:hover, .year-option:hover { background-color: #e0e7ff !important; border-color: #6366f1; color: #6366f1; }
    .month-option.selected, .year-option.selected { background-color: #6366f1 !important; color: white; border-color: #6366f1; }
    
    .lunar-toggle { display: inline-flex; align-items: center; margin-bottom: 8px; font-size: 0.875rem; }
    .lunar-toggle input[type="checkbox"] { margin-right: 6px; }

    .table-container { width: 100%; overflow: hidden; }
    .table-container table { table-layout: fixed; width: 100%; }
    .table-container td { overflow: hidden; word-wrap: break-word; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .responsive-table { table-layout: fixed; width: 100%; }
    .td-content-wrapper { word-wrap: break-word; white-space: normal; text-align: left; width: 100%; }
    .td-content-wrapper > * { text-align: left; }

    @media (max-width: 767px) {
      .table-container { overflow: hidden; }
      .responsive-table thead { display: none; }
      .responsive-table tbody, .responsive-table tr, .responsive-table td { display: block; width: 100%; }
      .responsive-table tr { margin-bottom: 1.5rem; border: 1px solid #ddd; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden; }
      .responsive-table td { display: flex; justify-content: flex-start; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
      .responsive-table td:last-of-type { border-bottom: none; }
      .responsive-table td:before { content: attr(data-label); font-weight: 600; text-align: left; padding-right: 1rem; color: #374151; white-space: nowrap; }
      .action-buttons-wrapper { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
      
      .notes-container, .hover-container { max-width: 180px; text-align: right; }
      .td-content-wrapper .notes-text { text-align: right; }
      #systemTimeDisplay { display: none !important; }
    }
    @media (min-width: 768px) { .table-container { overflow: hidden; } }

    .toast {
      position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px;
      color: white; font-weight: 500; z-index: 1000; transform: translateX(400px);
      transition: all 0.3s ease-in-out; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .toast.show { transform: translateX(0); }
    .toast.success { background-color: #10b981; }
    .toast.error { background-color: #ef4444; }
    .toast.info { background-color: #3b82f6; }
    .toast.warning { background-color: #f59e0b; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div id="toast-container"></div>

  <nav class="bg-white shadow-md relative z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center shrink-0">
          <div class="flex items-center">
            <i class="fas fa-calendar-check text-indigo-600 text-2xl mr-2"></i>
            <span class="font-bold text-xl text-gray-800">订阅管理系统</span>
          </div>
          <span id="systemTimeDisplay" class="ml-4 text-base text-indigo-600 font-normal hidden md:block pt-1"></span>
        </div>

        <div class="hidden md:flex items-center space-x-4 ml-auto">
          <a href="/admin/dashboard" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-chart-line mr-1"></i>仪表盘
          </a>
          <a href="/admin" class="text-indigo-600 border-b-2 border-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-list mr-1"></i>订阅列表
          </a>
          <a href="/admin/config" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-cog mr-1"></i>系统配置
          </a>
          <a href="/api/logout" class="text-gray-700 hover:text-red-600 border-b-2 border-transparent hover:border-red-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-sign-out-alt mr-1"></i>退出登录
          </a>
        </div>

        <div class="flex items-center md:hidden ml-auto">
          <button id="mobile-menu-btn" type="button" class="text-gray-600 hover:text-indigo-600 focus:outline-none p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <i class="fas fa-bars text-xl"></i>
          </button>
        </div>
      </div>
    </div>
    
    <div id="mobile-menu" class="hidden md:hidden bg-white border-t border-b border-gray-200 w-full">
       <div class="px-4 pt-2 pb-4 space-y-2">
        <div id="mobileTimeDisplay" class="px-3 py-2 text-xs text-indigo-600 text-right border-b border-gray-100 mb-2"></div>
        <a href="/admin/dashboard" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-chart-line w-6 text-center mr-2"></i>仪表盘
        </a>
        <a href="/admin" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-list w-6 text-center mr-2"></i>订阅列表
        </a>
        <a href="/admin/config" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-cog w-6 text-center mr-2"></i>系统配置
        </a>
        <a href="/api/logout" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 active:bg-red-100 transition-colors">
          <i class="fas fa-sign-out-alt w-6 text-center mr-2"></i>退出登录
        </a>
      </div>
    </div>
  </nav>
  
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-800">订阅列表</h2>
        <p class="text-sm text-gray-500 mt-1">使用搜索与分类快速定位订阅，开启农历显示可同步查看农历日期</p>
      </div>
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 w-full">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:flex-1 lg:max-w-2xl">
          <div class="relative flex-1 min-w-[200px] lg:max-w-md">
            <input type="text" id="searchKeyword" placeholder="搜索名称、类型或备注..." class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <i class="fas fa-search"></i>
            </span>
          </div>
          <div class="sm:w-36 lg:w-32">
            <select id="modeFilter" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm">
              <option value="">全部模式</option>
              <option value="cycle">循环订阅</option>
              <option value="reset">到期重置</option>
            </select>
          </div>
          <div class="sm:w-44 lg:w-40">
            <select id="categoryFilter" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm">
              <option value="">全部分类</option>
            </select>
          </div>

        </div>
        <div class="flex items-center space-x-3 lg:space-x-4">
        <label class="lunar-toggle">
          <input type="checkbox" id="listShowLunar" class="form-checkbox h-4 w-4 text-indigo-600 shrink-0">
          <span class="text-gray-700">显示农历</span>
        </label>
        <button id="addSubscriptionBtn" class="btn-primary text-white px-4 py-2 rounded-md text-sm font-medium flex items-center shrink-0">
          <i class="fas fa-plus mr-2"></i>添加新订阅
        </button>
      </div>
      </div>
    </div>
    
    <div class="table-container bg-white rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full divide-y divide-gray-200 responsive-table">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 23%;">名称</th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 13%;">类型</th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 18%;">到期 <i class="fas fa-sort-up ml-1 text-indigo-500" title="按到期时间升序排列"></i></th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 10%;">金额</th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 13%;">提醒</th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 10%;">状态</th>
              <th scope="col" class="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider" style="width: 13%;">操作</th>
            </tr>
          </thead>
          <tbody id="subscriptionsBody" class="bg-white divide-y divide-gray-200"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- 订阅表单模态框 -->
  <div id="subscriptionModal" class="fixed inset-0 z-50 hidden overflow-y-auto bg-gray-600 bg-opacity-50">
    <div class="relative w-auto max-w-2xl mx-4 md:mx-auto my-12 bg-white rounded-lg shadow-xl">
      <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
        <div class="flex items-center justify-between">
          <h3 id="modalTitle" class="text-lg font-medium text-gray-900">添加新订阅</h3>
          <button id="closeModal" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
      </div>
      
      <form id="subscriptionForm" class="p-6 space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-1">订阅名称 *</label>
            <input type="text" id="name" required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
            <div class="error-message text-red-500" data-for="name"></div>
          </div>
          
          <div class="custom-dropdown-wrapper">
            <label for="customType" class="block text-sm font-medium text-gray-700 mb-1">订阅类型</label>
            <input type="text" id="customType" placeholder="选择或输入自定义类型" autocomplete="off"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
            <div id="customTypeDropdown" class="custom-dropdown-list"></div>
          </div>

          <div class="custom-dropdown-wrapper">
            <label for="category" class="block text-sm font-medium text-gray-700 mb-1">分类标签</label>
            <input type="text" id="category" placeholder="选择或输入自定义标签" autocomplete="off"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
            <div id="categoryDropdown" class="custom-dropdown-list"></div>
            <p class="mt-1 text-xs text-gray-500">可输入多个标签并使用"/"分隔</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              费用设置 <span class="text-gray-400 text-xs ml-1">可选</span>
            </label>
            <div class="flex space-x-2">
              <div class="w-24 shrink-0"> 
                <select id="currency" class="h-10 w-full px-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm">
                  <option value="CNY" selected>CNY (¥)</option>
                  <option value="USD">USD ($)</option>
                  <option value="HKD">HKD (HK$)</option>
                  <option value="TWD">TWD (NT$)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="KRW">KRW (₩)</option>
                  <option value="TRY">TRY (₺)</option>
                </select>
              </div>
              <div class="relative flex-1">
                <input type="number" id="amount" step="0.01" min="0" placeholder="例如: 15.00"
                  class="h-10 w-full px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            <p class="mt-1 text-xs text-gray-500">用于统计支出和生成仪表盘</p>
          </div>

          <div>
             <div class="flex justify-between items-center mb-1">
                <label for="subscriptionMode" class="block text-sm font-medium text-gray-700">订阅模式</label>
             </div>
            <select id="subscriptionMode" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white h-10">
              <option value="cycle" selected>📅 循环订阅</option>
              <option value="reset">⏳ 到期重置</option>
            </select>
            
            <div class="mt-2 flex items-center space-x-3">
                 <label class="inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" id="showLunar" class="form-checkbox h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500">
                  <span class="ml-2 text-sm text-gray-600">显示农历日期</span>
                </label>
                <label class="inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" id="useLunar" class="form-checkbox h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500">
                  <span class="ml-2 text-sm text-gray-600">农历周期</span>
                </label>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="md:col-span-2">
            <label for="startDate" class="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
            <div class="relative">
              <input type="text" id="startDate"
                class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                placeholder="YYYY-MM-DD">
              <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <i class="fas fa-calendar text-gray-400"></i>
              </div>
               <div id="startDatePicker" class="custom-date-picker hidden absolute top-full left-0 z-50 bg-white border border-gray-300 rounded-md shadow-lg p-4 w-full">
                  <div class="flex justify-between items-center mb-4">
                    <button type="button" id="startDatePrevMonth" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-left"></i></button>
                    <div class="flex items-center space-x-2">
                      <span id="startDateMonth" class="font-medium text-gray-900 cursor-pointer hover:text-indigo-600">1月</span>
                      <span class="text-gray-400">|</span>
                      <span id="startDateYear" class="font-medium text-gray-900 cursor-pointer hover:text-indigo-600">2024</span>
                    </div>
                    <button type="button" id="startDateNextMonth" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-right"></i></button>
                  </div>
                  <div id="startDateMonthPicker" class="hidden mb-4"><div class="flex justify-between items-center mb-3"><span class="font-medium text-gray-900">选择月份</span><button type="button" id="startDateBackToCalendar" class="text-gray-600 hover:text-gray-800"><i class="fas fa-times"></i></button></div><div class="grid grid-cols-3 gap-2"><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="0">1月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="1">2月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="2">3月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="3">4月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="4">5月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="5">6月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="6">7月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="7">8月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="8">9月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="9">10月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="10">11月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="11">12月</button></div></div>
                  <div id="startDateYearPicker" class="hidden mb-4"><div class="flex justify-between items-center mb-3"><span class="font-medium text-gray-900">选择年份</span><button type="button" id="startDateBackToCalendarFromYear" class="text-gray-600 hover:text-gray-800"><i class="fas fa-times"></i></button></div><div class="flex justify-between items-center mb-3"><button type="button"  id="startDatePrevYearDecade" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-left"></i></button><span id="startDateYearRange" class="font-medium text-gray-900">2020-2029</span><button type="button"  id="startDateNextYearDecade" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-right"></i></button></div><div id="startDateYearGrid" class="grid grid-cols-3 gap-2"></div></div>
                  <div class="grid grid-cols-7 gap-2 mb-3"><div class="text-center text-sm font-semibold text-gray-600 py-2">日</div><div class="text-center text-sm font-semibold text-gray-600 py-2">一</div><div class="text-center text-sm font-semibold text-gray-600 py-2">二</div><div class="text-center text-sm font-semibold text-gray-600 py-2">三</div><div class="text-center text-sm font-semibold text-gray-600 py-2">四</div><div class="text-center text-sm font-semibold text-gray-600 py-2">五</div><div class="text-center text-sm font-semibold text-gray-600 py-2">六</div></div><div id="startDateCalendar" class="grid grid-cols-7 gap-2"></div>
                  <div class="mt-4 pt-3 border-t border-gray-200"><button type="button" id="startDateGoToToday" class="w-full px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md"><i class="fas fa-calendar-day mr-2"></i>回到今天</button></div>
               </div>
            </div>
            <div id="startDateLunar" class="lunar-display pl-1"></div>
          </div>
          
          <div>
            <label for="periodValue" class="block text-sm font-medium text-gray-700 mb-1">周期数值 *</label>
            <input type="number" id="periodValue" min="1" value="1" required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
          </div>
          
          <div>
            <label for="periodUnit" class="block text-sm font-medium text-gray-700 mb-1">周期单位 *</label>
            <select id="periodUnit" required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
              <option value="day">天</option>
              <option value="month" selected>月</option>
              <option value="year">年</option>
            </select>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
              <label for="expiryDate" class="block text-sm font-medium text-gray-700 mb-1">到期日期 *</label>
              <div class="relative">
                <input type="text" id="expiryDate" required
                  class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  placeholder="YYYY-MM-DD">
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <i class="fas fa-calendar text-gray-400"></i>
                </div>
                <div id="expiryDatePicker" class="custom-date-picker hidden absolute top-full left-0 z-50 bg-white border border-gray-300 rounded-md shadow-lg p-4 w-full">
                    <div class="flex justify-between items-center mb-4">
                      <button type="button" id="expiryDatePrevMonth" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-left"></i></button>
                      <div class="flex items-center space-x-2"><span id="expiryDateMonth" class="font-medium text-gray-900 cursor-pointer hover:text-indigo-600">1月</span><span class="text-gray-400">|</span><span id="expiryDateYear" class="font-medium text-gray-900 cursor-pointer hover:text-indigo-600">2024</span></div>
                      <button type="button" id="expiryDateNextMonth" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-right"></i></button>
                    </div>
                    <div id="expiryDateMonthPicker" class="hidden mb-4"><div class="flex justify-between items-center mb-3"><span class="font-medium text-gray-900">选择月份</span><button type="button" id="expiryDateBackToCalendar" class="text-gray-600 hover:text-gray-800"><i class="fas fa-times"></i></button></div><div class="grid grid-cols-3 gap-2"><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="0">1月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="1">2月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="2">3月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="3">4月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="4">5月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="5">6月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="6">7月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="7">8月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="8">9月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="9">10月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="10">11月</button><button type="button" class="month-option px-3 py-2 text-sm rounded hover:bg-gray-100" data-month="11">12月</button></div></div>
                    <div id="expiryDateYearPicker" class="hidden mb-4"><div class="flex justify-between items-center mb-3"><span class="font-medium text-gray-900">选择年份</span><button type="button" id="expiryDateBackToCalendarFromYear" class="text-gray-600 hover:text-gray-800"><i class="fas fa-times"></i></button></div><div class="flex justify-between items-center mb-3"><button type="button" id="expiryDatePrevYearDecade" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-left"></i></button><span id="expiryDateYearRange" class="font-medium text-gray-900">2020-2029</span><button type="button" id="expiryDateNextYearDecade" class="text-gray-600 hover:text-gray-800"><i class="fas fa-chevron-right"></i></button></div><div id="expiryDateYearGrid" class="grid grid-cols-3 gap-2"></div></div>
                    <div class="grid grid-cols-7 gap-2 mb-3"><div class="text-center text-sm font-semibold text-gray-600 py-2">日</div><div class="text-center text-sm font-semibold text-gray-600 py-2">一</div><div class="text-center text-sm font-semibold text-gray-600 py-2">二</div><div class="text-center text-sm font-semibold text-gray-600 py-2">三</div><div class="text-center text-sm font-semibold text-gray-600 py-2">四</div><div class="text-center text-sm font-semibold text-gray-600 py-2">五</div><div class="text-center text-sm font-semibold text-gray-600 py-2">六</div></div><div id="expiryDateCalendar" class="grid grid-cols-7 gap-2"></div>
                    <div class="mt-4 pt-3 border-t border-gray-200"><button type="button" id="expiryDateGoToToday" class="w-full px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md"><i class="fas fa-calendar-day mr-2"></i>回到今天</button></div>
                </div>
              </div>
              <div id="expiryDateLunar" class="lunar-display pl-1 mb-1"></div>
              <div class="error-message text-red-500" data-for="expiryDate"></div>
          </div>

          <div class="flex items-start">
              <button type="button" id="calculateExpiryBtn" class="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium transition-colors flex items-center justify-center h-[42px] whitespace-nowrap">
                <i class="fas fa-calculator mr-2"></i>自动计算到期日期
              </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="reminderValue" class="block text-sm font-medium text-gray-700 mb-1">提醒提前量</label>
              <div class="flex space-x-2">
                <div class="relative flex-1">
                  <input type="number" id="reminderValue" min="0" value="7"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                </div>
                <div class="w-24 shrink-0">
                  <select id="reminderUnit"
                    class="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                    <option value="day" selected>天</option>
                    <option value="hour">小时</option>
                  </select>
                </div>
              </div>
               <div class="error-message text-red-500" data-for="reminderValue"></div>
               <p class="mt-2 text-xs text-gray-500 leading-tight">
                 0 = 仅在到期时提醒; 选择"小时"需要将 Worker 定时任务调整为小时级执行
               </p>
            </div>

            <div>
               <label class="block text-sm font-medium text-gray-700 mb-3">选项设置</label>
               <div class="flex items-center space-x-6">
                  <label class="inline-flex items-center cursor-pointer select-none group">
                    <input type="checkbox" id="isActive" checked 
                      class="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 transition duration-150 ease-in-out">
                    <span class="ml-2 text-sm text-gray-700 font-medium group-hover:text-indigo-700">启用订阅</span>
                  </label>
                  
                  <label class="inline-flex items-center cursor-pointer select-none group">
                    <input type="checkbox" id="autoRenew" checked 
                      class="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 transition duration-150 ease-in-out">
                    <span class="ml-2 text-sm text-gray-700 font-medium group-hover:text-indigo-700">自动续订</span>
                  </label>
               </div>
            </div>
        </div>

        <div>
          <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">备注</label>
          <textarea id="notes" rows="2" placeholder="可添加相关备注信息..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></textarea>
          <div class="error-message text-red-500"></div>
        </div>
        
        <input type="hidden" id="subscriptionId">

        <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" id="cancelBtn" 
            class="px-5 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 bg-white transition-colors">
            取消
          </button>
          <button type="submit" 
            class="btn-primary text-white px-6 py-2 rounded-md text-sm font-medium shadow-md hover:shadow-lg transform active:scale-95 transition-all">
            <i class="fas fa-save mr-2"></i>保存
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    // 农历转换工具函数
    const lunarCalendar = {
      lunarInfo: [
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
        0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
        0x14b63, 0x09370, 0x14a38, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x1a978, 0x16aa0, 0x0a6c0,
        0x0aa60, 0x16d63, 0x0d260, 0x0d950, 0x0d554, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7,
        0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0,
        0x15176, 0x052b0, 0x0a930, 0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0,
        0x0d260, 0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x1a4bb, 0x0a4d0, 0x0d0b0,
        0x0d250
      ],
      gan: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
      zhi: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],
      months: ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'],
      days: ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
             '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
             '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'],
      
      leapDays: function(year) {
        if (this.leapMonth(year)) {
          return (this.lunarInfo[year - 1900] & 0x10000) ? 30 : 29;
        }
        return 0;
      },
      leapMonth: function(year) {
        return this.lunarInfo[year - 1900] & 0xf;
      },
      monthDays: function(year, month) {
        return (this.lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
      },
      solar2lunar: function(year, month, day) {
        if (year < 1900 || year > 2100) return null;
        const baseDate = Date.UTC(1900, 0, 31);
        const objDate = Date.UTC(year, month - 1, day);
        let offset = Math.round((objDate - baseDate) / 86400000);
        let temp = 0;
        let lunarYear = 1900;
        for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
          temp = 348;
          for (let i = 0x8000; i > 0x8; i >>= 1) {
            temp += (this.lunarInfo[lunarYear - 1900] & i) ? 1 : 0;
          }
          temp += this.leapDays(lunarYear);
          offset -= temp;
        }
        if (offset < 0) {
          offset += temp;
          lunarYear--;
        }
        let lunarMonth = 1;
        let leap = this.leapMonth(lunarYear);
        let isLeap = false;
        for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
          if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
            --lunarMonth;
            isLeap = true;
            temp = this.leapDays(lunarYear);
          } else {
            temp = this.monthDays(lunarYear, lunarMonth);
          }
          if (isLeap && lunarMonth === (leap + 1)) isLeap = false;
          offset -= temp;
        }
        if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
          if (isLeap) {
            isLeap = false;
          } else {
            isLeap = true;
            --lunarMonth;
          }
        }
        if (offset < 0) {
          offset += temp;
          --lunarMonth;
        }
        const lunarDay = offset + 1;
        const ganIndex = (lunarYear - 4) % 10;
        const zhiIndex = (lunarYear - 4) % 12;
        const yearStr = this.gan[ganIndex] + this.zhi[zhiIndex] + '年';
        const monthStr = (isLeap ? '闰' : '') + this.months[lunarMonth - 1] + '月';
        const dayStr = this.days[lunarDay - 1];
        return {
          year: lunarYear, month: lunarMonth, day: lunarDay, isLeap: isLeap,
          yearStr: yearStr, monthStr: monthStr, dayStr: dayStr, fullStr: yearStr + monthStr + dayStr
        };
      }
    };

    // 农历转公历
    function lunar2solar(lunar) {
      for (let y = lunar.year - 1; y <= lunar.year + 1; y++) {
        for (let m = 1; m <= 12; m++) {
          for (let d = 1; d <= 31; d++) {
            const date = new Date(y, m - 1, d);
            if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) continue;
            const l = lunarCalendar.solar2lunar(y, m, d);
            if (l && l.year === lunar.year && l.month === lunar.month && 
                l.day === lunar.day && l.isLeap === lunar.isLeap) {
              return { year: y, month: m, day: d };
            }
          }
        }
      }
      return null;
    }

    // 农历加周期
    function addLunarPeriod(lunar, periodValue, periodUnit) {
      let { year, month, day, isLeap } = lunar;
      if (periodUnit === 'year') {
        year += periodValue;
        const leap = lunarCalendar.leapMonth(year);
        if (isLeap && leap === month) {
          isLeap = true;
        } else {
          isLeap = false;
        }
      } else if (periodUnit === 'month') {
        let totalMonths = (year - 1900) * 12 + (month - 1) + periodValue;
        year = Math.floor(totalMonths / 12) + 1900;
        month = (totalMonths % 12) + 1;
        const leap = lunarCalendar.leapMonth(year);
        if (isLeap && leap === month) {
          isLeap = true;
        } else {
          isLeap = false;
        }
      } else if (periodUnit === 'day') {
        const solar = lunar2solar(lunar);
        const date = new Date(solar.year, solar.month - 1, solar.day + periodValue);
        return lunarCalendar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
      }
      let maxDay = isLeap ? lunarCalendar.leapDays(year) : lunarCalendar.monthDays(year, month);
      let targetDay = Math.min(day, maxDay);
      while (targetDay > 0) {
        let solar = lunar2solar({ year, month, day: targetDay, isLeap });
        if (solar) {
          return { year, month, day: targetDay, isLeap };
        }
        targetDay--;
      }
      return { year, month, day, isLeap };
    }

    // 前端农历业务对象
    const lunarBiz = {
      addLunarPeriod: addLunarPeriod,
      lunar2solar: lunar2solar
    };

    // 全局变量
    let globalTimezone = 'UTC';
    let subscriptionsCache = [];
    let searchDebounceTimer = null;

    // ==================== 工具函数 ====================
    function showToast(message, type = 'success', duration = 3000) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      const icon = type === 'success' ? 'check-circle' :
                   type === 'error' ? 'exclamation-circle' :
                   type === 'warning' ? 'exclamation-triangle' : 'info-circle';
      toast.innerHTML = '<div class="flex items-center"><i class="fas fa-' + icon + ' mr-2"></i><span>' + message + '</span></div>';
      container.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 100);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          if (container.contains(toast)) {
            container.removeChild(toast);
          }
        }, 300);
      }, duration);
    }

    function showFieldError(fieldId, message) {
      const field = document.getElementById(fieldId);
      let errorDiv = field.parentElement ? field.parentElement.querySelector('.error-message') : null;
      if (!errorDiv) {
        errorDiv = document.querySelector('.error-message[data-for="' + fieldId + '"]');
      }
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        field.classList.add('border-red-500');
      }
    }

    function clearFieldErrors() {
      document.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
      });
      document.querySelectorAll('.border-red-500').forEach(el => {
        el.classList.remove('border-red-500');
      });
    }

    function validateForm() {
      clearFieldErrors();
      let isValid = true;

      const name = document.getElementById('name').value.trim();
      if (!name) {
        showFieldError('name', '请输入订阅名称');
        isValid = false;
      }

      const periodValue = document.getElementById('periodValue').value;
      if (!periodValue || periodValue < 1) {
        showFieldError('periodValue', '周期数值必须大于0');
        isValid = false;
      }

      const expiryDate = document.getElementById('expiryDate').value;
      if (!expiryDate) {
        showFieldError('expiryDate', '请选择到期日期');
        isValid = false;
      }

      const reminderValueField = document.getElementById('reminderValue');
      const reminderValue = reminderValueField.value;
      if (reminderValue === '' || Number(reminderValue) < 0) {
        showFieldError('reminderValue', '提醒值不能为负数');
        isValid = false;
      }

      return isValid;
    }

    // 分类标签处理
    const categorySeparator = /[\/,，\s]+/;
    function normalizeCategoryTokens(category = '') {
      return category
        .split(categorySeparator)
        .map(token => token.trim())
        .filter(token => token.length > 0);
    }

    // 悬浮提示
    function createHoverText(text, maxLength = 30, className = 'text-sm text-gray-900') {
      if (!text || text.length <= maxLength) {
        return '<div class="' + className + '">' + text + '</div>';
      }
      const truncated = text.substring(0, maxLength) + '...';
      return '<div class="hover-container">' +
        '<div class="hover-text ' + className + '" data-full-text="' + text.replace(/"/g, '&quot;') + '">' +
          truncated +
        '</div>' +
        '<div class="hover-tooltip"></div>' +
      '</div>';
    }

    // 获取提醒设置
    function getReminderSettings(subscription) {
      const fallbackDays = subscription.reminderDays !== undefined ? subscription.reminderDays : 7;
      let unit = subscription.reminderUnit || '';
      let value = subscription.reminderValue;

      if (unit !== 'hour') unit = 'day';
      if (unit === 'hour' && (value === undefined || value === null || isNaN(value))) {
        value = subscription.reminderHours !== undefined ? subscription.reminderHours : 0;
      }
      if (value === undefined || value === null || isNaN(value)) value = fallbackDays;
      value = Number(value);

      return {
        unit,
        value,
        displayText: unit === 'hour' ? '提前' + value + '小时' : '提前' + value + '天'
      };
    }

    // 农历显示
    function updateLunarDisplay(dateInputId, lunarDisplayId) {
      const dateInput = document.getElementById(dateInputId);
      const lunarDisplay = document.getElementById(lunarDisplayId);
      const showLunar = document.getElementById('showLunar');

      if (!dateInput || !lunarDisplay) return;
      if (!dateInput.value || !showLunar || !showLunar.checked) {
        lunarDisplay.classList.remove('show');
        return;
      }

      const parts = dateInput.value.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      
      const lunar = lunarCalendar.solar2lunar(year, month, day);
      if (lunar) {
        lunarDisplay.textContent = '农历：' + lunar.fullStr;
        lunarDisplay.classList.add('show');
      } else {
        lunarDisplay.classList.remove('show');
      }
    }

    function toggleLunarDisplay() {
      const showLunar = document.getElementById('showLunar');
      if (!showLunar) return;
      updateLunarDisplay('startDate', 'startDateLunar');
      updateLunarDisplay('expiryDate', 'expiryDateLunar');
      localStorage.setItem('showLunar', showLunar.checked);
    }

    function loadLunarPreference() {
      const showLunar = document.getElementById('showLunar');
      if (!showLunar) return;
      const saved = localStorage.getItem('showLunar');
      showLunar.checked = saved !== null ? saved === 'true' : true;
      toggleLunarDisplay();
    }

    // ==================== 日期选择器 ====================
    class CustomDatePicker {
      constructor(inputId, pickerId, calendarId, monthId, yearId, prevBtnId, nextBtnId) {
        this.input = document.getElementById(inputId);
        this.picker = document.getElementById(pickerId);
        this.calendar = document.getElementById(calendarId);
        this.monthElement = document.getElementById(monthId);
        this.yearElement = document.getElementById(yearId);
        this.prevBtn = document.getElementById(prevBtnId);
        this.nextBtn = document.getElementById(nextBtnId);
        
        this.monthPicker = document.getElementById(pickerId.replace('Picker', 'MonthPicker'));
        this.yearPicker = document.getElementById(pickerId.replace('Picker', 'YearPicker'));
        this.backToCalendarBtn = document.getElementById(pickerId.replace('Picker', 'BackToCalendar'));
        this.backToCalendarFromYearBtn = document.getElementById(pickerId.replace('Picker', 'BackToCalendarFromYear'));
        this.goToTodayBtn = document.getElementById(pickerId.replace('Picker', 'GoToToday'));
        this.prevYearDecadeBtn = document.getElementById(pickerId.replace('Picker', 'PrevYearDecade'));
        this.nextYearDecadeBtn = document.getElementById(pickerId.replace('Picker', 'NextYearDecade'));
        this.yearRangeElement = document.getElementById(pickerId.replace('Picker', 'YearRange'));
        this.yearGrid = document.getElementById(pickerId.replace('Picker', 'YearGrid'));
        
        this.currentDate = new Date();
        this.selectedDate = null;
        this.currentView = 'calendar';
        this.yearDecade = Math.floor(this.currentDate.getFullYear() / 10) * 10;
        
        this.init();
      }
      
      init() {
        if (this.input) {
          this.input.removeEventListener('click', this._forceShowHandler);
          this._forceShowHandler = () => this.forceShow();
          this.input.addEventListener('click', this._forceShowHandler);
          if (this._manualInputHandler) {
            this.input.removeEventListener('blur', this._manualInputHandler);
          }
          this._manualInputHandler = () => this.syncFromInputValue();
          this.input.addEventListener('blur', this._manualInputHandler);

          if (this._manualKeydownHandler) {
            this.input.removeEventListener('keydown', this._manualKeydownHandler);
          }
          this._manualKeydownHandler = (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              this.syncFromInputValue();
            }
          };
          this.input.addEventListener('keydown', this._manualKeydownHandler);
        }
        
        if (this.prevBtn) {
          this.prevBtn.removeEventListener('click', this._prevHandler);
          this._prevHandler = () => this.previousMonth();
          this.prevBtn.addEventListener('click', this._prevHandler);
        }
        
        if (this.nextBtn) {
          this.nextBtn.removeEventListener('click', this._nextHandler);
          this._nextHandler = () => this.nextMonth();
          this.nextBtn.addEventListener('click', this._nextHandler);
        }
        
        if (this.monthElement) {
          this.monthElement.removeEventListener('click', this._showMonthHandler);
          this._showMonthHandler = () => this.showMonthPicker();
          this.monthElement.addEventListener('click', this._showMonthHandler);
        }
        
        if (this.yearElement) {
          this.yearElement.removeEventListener('click', this._showYearHandler);
          this._showYearHandler = () => this.showYearPicker();
          this.yearElement.addEventListener('click', this._showYearHandler);
        }
        
        if (this.monthPicker) {
          this.monthPicker.removeEventListener('click', this._monthSelectHandler);
          this._monthSelectHandler = (e) => {
            if (e.target.classList.contains('month-option')) {
              const month = parseInt(e.target.dataset.month);
              this.selectMonth(month);
            }
          };
          this.monthPicker.addEventListener('click', this._monthSelectHandler);
        }
        
        if (this.backToCalendarBtn) {
          this.backToCalendarBtn.removeEventListener('click', this._backToCalendarHandler);
          this._backToCalendarHandler = () => this.showCalendar();
          this.backToCalendarBtn.addEventListener('click', this._backToCalendarHandler);
        }
        
        if (this.backToCalendarFromYearBtn) {
          this.backToCalendarFromYearBtn.removeEventListener('click', this._backToCalendarFromYearHandler);
          this._backToCalendarFromYearHandler = () => this.showCalendar();
          this.backToCalendarFromYearBtn.addEventListener('click', this._backToCalendarFromYearHandler);
        }
        
        if (this.prevYearDecadeBtn) {
          this.prevYearDecadeBtn.removeEventListener('click', this._prevYearDecadeHandler);
          this._prevYearDecadeHandler = (e) => {
            e.stopPropagation();
            this.previousYearDecade();
          };
          this.prevYearDecadeBtn.addEventListener('click', this._prevYearDecadeHandler);
        }

        if (this.nextYearDecadeBtn) {
          this.nextYearDecadeBtn.removeEventListener('click', this._nextYearDecadeHandler);
          this._nextYearDecadeHandler = (e) => {
            e.stopPropagation();
            this.nextYearDecade();
          };
          this.nextYearDecadeBtn.addEventListener('click', this._nextYearDecadeHandler);
        }
        
        if (this.goToTodayBtn) {
          this.goToTodayBtn.removeEventListener('click', this._goToTodayHandler);
          this._goToTodayHandler = () => this.goToToday();
          this.goToTodayBtn.addEventListener('click', this._goToTodayHandler);
        }
        
        if (this._outsideClickHandler) {
          document.removeEventListener('click', this._outsideClickHandler);
        }
        this._outsideClickHandler = (e) => {
          if (this.picker && !this.picker.contains(e.target) && !this.input.contains(e.target)) {
            this.hide();
          }
        };
        document.addEventListener('click', this._outsideClickHandler);
        
        this.syncFromInputValue();
        this.render();
        this.renderYearGrid();
      }
      
      forceShow() {
        if (this.picker) {
          this.picker.classList.remove('hidden');
          this.currentView = 'calendar';
          this.hideAllViews();
          this.render();
        }
      }
      
      hide() {
        if (this.picker) this.picker.classList.add('hidden');
      }
      
      previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
      }
      
      nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
      }
      
      selectDate(date) {
        this.selectedDate = date;
        if (this.input) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          this.input.value = year + '-' + month + '-' + day;
        }
        this.hide();
        if (this.input) {
          const event = new Event('change', { bubbles: false });
          this.input.dispatchEvent(event);
        }
      }

      syncFromInputValue() {
        if (!this.input) return;
        const value = this.input.value.trim();
        if (!value) {
          this.selectedDate = null;
          return;
        }

        const match = value.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
        if (!match) {
          if (typeof showToast === 'function') showToast('日期格式需为 YYYY-MM-DD', 'warning');
          return;
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const parsed = new Date(year, month - 1, day);
        if (isNaN(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
          if (typeof showToast === 'function') showToast('请输入有效的日期', 'warning');
          return;
        }

        this.selectedDate = parsed;
        this.currentDate = new Date(parsed);
        this.render();

        const event = new Event('change', { bubbles: false });
        this.input.dispatchEvent(event);
      }
      
      render() {
        if (!this.monthElement || !this.yearElement || !this.calendar) return;
        
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        this.monthElement.textContent = (month + 1) + '月';
        this.yearElement.textContent = year;
        
        this.calendar.innerHTML = '';
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        
        for (let i = 0; i < 42; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + i);
          
          const dayElement = document.createElement('div');
          dayElement.className = 'calendar-day';
          
          if (date.getMonth() !== month) dayElement.classList.add('other-month');
          
          const today = new Date();
          if (date.toDateString() === today.toDateString()) dayElement.classList.add('today');
          if (this.selectedDate && date.toDateString() === this.selectedDate.toDateString()) dayElement.classList.add('selected');
          
          let lunarText = '';
          try {
            const lunar = lunarCalendar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
            if (lunar) {
              if (lunar.day === 1) {
                lunarText = lunar.isLeap ? '闰' + lunar.monthStr.replace('闰', '') : lunar.monthStr;
              } else {
                lunarText = lunar.dayStr;
              }
            }
          } catch (error) { console.error('农历转换错误:', error); }
          
          dayElement.innerHTML = '<div>' + date.getDate() + '</div><div class="lunar-text">' + lunarText + '</div>';
          dayElement.addEventListener('click', () => this.selectDate(date));
          
          this.calendar.appendChild(dayElement);
        }
      }
      
      showMonthPicker() {
        this.currentView = 'month';
        this.hideAllViews();
        if (this.monthPicker) {
          this.monthPicker.classList.remove('hidden');
          const monthOptions = this.monthPicker.querySelectorAll('.month-option');
          monthOptions.forEach((option, index) => {
            option.classList.remove('selected');
            if (index === this.currentDate.getMonth()) option.classList.add('selected');
          });
        }
      }
      
      showYearPicker() {
        this.currentView = 'year';
        this.hideAllViews();
        if (this.yearPicker) this.yearPicker.classList.remove('hidden');
        this.renderYearGrid();
      }
      
      showCalendar() {
        this.currentView = 'calendar';
        this.hideAllViews();
        this.render();
      }
      
      hideAllViews() {
        if (this.monthPicker) this.monthPicker.classList.add('hidden');
        if (this.yearPicker) this.yearPicker.classList.add('hidden');
      }
      
      selectMonth(month) {
        this.currentDate.setMonth(month);
        this.showCalendar();
      }
      
      selectYear(year) {
        this.currentDate.setFullYear(year);
        this.showCalendar();
      }
      
      previousYearDecade() {
        this.yearDecade -= 10;
        this.renderYearGrid();
      }
      
      nextYearDecade() {
        this.yearDecade += 10;
        this.renderYearGrid();
      }
      
      renderYearGrid() {
        if (!this.yearGrid || !this.yearRangeElement) return;
        
        const startYear = this.yearDecade;
        const endYear = this.yearDecade + 9;
        
        this.yearRangeElement.textContent = startYear + '-' + endYear;
        this.yearGrid.innerHTML = '';
        
        for (let year = startYear; year <= endYear; year++) {
          const yearBtn = document.createElement('button');
          yearBtn.type = 'button';
          yearBtn.className = 'year-option px-3 py-2 text-sm rounded hover:bg-gray-100';
          yearBtn.textContent = year;
          yearBtn.dataset.year = year;
          
          if (year === this.currentDate.getFullYear()) {
            yearBtn.classList.add('bg-indigo-100', 'text-indigo-600');
          }
          
          if (year < 1900 || year > 2100) {
            yearBtn.disabled = true;
            yearBtn.classList.add('opacity-50', 'cursor-not-allowed');
          } else {
            yearBtn.addEventListener('click', () => this.selectYear(year));
          }
          
          this.yearGrid.appendChild(yearBtn);
        }
      }     
      goToToday() {
        this.currentDate = new Date();
        this.yearDecade = Math.floor(this.currentDate.getFullYear() / 10) * 10;
        this.showCalendar();
      }
      
      destroy() {
        this.hide();       
        if (this.input && this._forceShowHandler) this.input.removeEventListener('click', this._forceShowHandler);
        if (this.input && this._manualInputHandler) this.input.removeEventListener('blur', this._manualInputHandler);
        if (this.input && this._manualKeydownHandler) this.input.removeEventListener('keydown', this._manualKeydownHandler);
        if (this.prevBtn && this._prevHandler) this.prevBtn.removeEventListener('click', this._prevHandler);
        if (this.nextBtn && this._nextHandler) this.nextBtn.removeEventListener('click', this._nextHandler);
        if (this.monthElement && this._showMonthHandler) this.monthElement.removeEventListener('click', this._showMonthHandler);
        if (this.yearElement && this._showYearHandler) this.yearElement.removeEventListener('click', this._showYearHandler);
        if (this.monthPicker && this._monthSelectHandler) this.monthPicker.removeEventListener('click', this._monthSelectHandler);
        if (this.backToCalendarBtn && this._backToCalendarHandler) this.backToCalendarBtn.removeEventListener('click', this._backToCalendarHandler);
        if (this.backToCalendarFromYearBtn && this._backToCalendarFromYearHandler) this.backToCalendarFromYearBtn.removeEventListener('click', this._backToCalendarFromYearHandler);
        if (this.prevYearDecadeBtn && this._prevYearDecadeHandler) this.prevYearDecadeBtn.removeEventListener('click', this._prevYearDecadeHandler);
        if (this.nextYearDecadeBtn && this._nextYearDecadeHandler) this.nextYearDecadeBtn.removeEventListener('click', this._nextYearDecadeHandler);
        if (this.goToTodayBtn && this._goToTodayHandler) this.goToTodayBtn.removeEventListener('click', this._goToTodayHandler);
        if (this._outsideClickHandler) document.removeEventListener('click', this._outsideClickHandler);
      }
    }

    // ==================== 自定义下拉菜单 ====================
    const TYPE_OPTIONS = ["流媒体", "视频平台", "音乐平台", "云服务", "软件订阅", 
      "域名", "服务器", "会员服务", "学习平台", "健身/运动", 
      "游戏", "新闻/杂志", "生日", "纪念日", "其他"];
    
    const CATEGORY_OPTIONS = ["个人", "家庭", "工作", "公司", "娱乐", "学习", 
      "开发", "生产力", "社交", "健康", "财务"];

    function initCustomDropdown(inputId, listId, options) {
      const input = document.getElementById(inputId);
      const list = document.getElementById(listId);
      if (!input || !list) return;
      list.innerHTML = options.map(opt => '<div class="dropdown-item">' + opt + '</div>').join('');
      const showList = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown-list').forEach(el => el.classList.remove('show'));
        list.classList.add('show');
      };
      input.addEventListener('focus', showList);
      input.addEventListener('click', showList);
      list.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.classList.contains('dropdown-item')) {
          input.value = e.target.textContent;
          input.dispatchEvent(new Event('input'));
          list.classList.remove('show');
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-dropdown-wrapper')) {
        document.querySelectorAll('.custom-dropdown-list').forEach(el => el.classList.remove('show'));
      }
    });

    // ==================== 订阅列表渲染 ====================
    function populateCategoryFilter(subscriptions) {
      const select = document.getElementById('categoryFilter');
      if (!select) return;

      const previousValue = select.value;
      const categories = new Set();

      (subscriptions || []).forEach(subscription => {
        normalizeCategoryTokens(subscription.category).forEach(token => categories.add(token));
      });

      const sorted = Array.from(categories).sort((a, b) => a.localeCompare(b, 'zh-CN'));
      select.innerHTML = '';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '全部分类';
      select.appendChild(defaultOption);

      sorted.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
      });

      if (previousValue && sorted.map(item => item.toLowerCase()).includes(previousValue.toLowerCase())) {
        select.value = previousValue;
      } else {
        select.value = '';
      }
    }

    function attachHoverListeners() {
      function positionTooltip(element, tooltip) {
        const rect = element.getBoundingClientRect();
        const tooltipHeight = 100;
        const viewportHeight = window.innerHeight;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        let top = rect.bottom + scrollTop + 8;
        let left = rect.left;

        if (rect.bottom + tooltipHeight > viewportHeight) {
          top = rect.top + scrollTop - tooltipHeight - 8;
          tooltip.style.transform = 'translateY(10px)';
          tooltip.classList.add('tooltip-above');
        } else {
          tooltip.style.transform = 'translateY(-10px)';
          tooltip.classList.remove('tooltip-above');
        }

        const maxLeft = window.innerWidth - 320 - 20;
        if (left > maxLeft) left = maxLeft;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      }

      document.querySelectorAll('.notes-text').forEach(notesElement => {
        const fullNotes = notesElement.getAttribute('data-full-notes');
        const tooltip = notesElement.parentElement.querySelector('.notes-tooltip');

        if (fullNotes && tooltip) {
          notesElement.addEventListener('mouseenter', () => {
            tooltip.textContent = fullNotes;
            positionTooltip(notesElement, tooltip);
            tooltip.classList.add('show');
          });

          notesElement.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
          });

          window.addEventListener('scroll', () => {
            if (tooltip.classList.contains('show')) tooltip.classList.remove('show');
          }, { passive: true });
        }
      });

      document.querySelectorAll('.hover-text').forEach(hoverElement => {
        const fullText = hoverElement.getAttribute('data-full-text');
        const tooltip = hoverElement.parentElement.querySelector('.hover-tooltip');

        if (fullText && tooltip) {
          hoverElement.addEventListener('mouseenter', () => {
            tooltip.textContent = fullText;
            positionTooltip(hoverElement, tooltip);
            tooltip.classList.add('show');
          });

          hoverElement.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
          });

          window.addEventListener('scroll', () => {
            if (tooltip.classList.contains('show')) tooltip.classList.remove('show');
          }, { passive: true });
        }
      });
    }

    function renderSubscriptionTable() {
      const tbody = document.getElementById('subscriptionsBody');
      if (!tbody) return;

      const listShowLunar = document.getElementById('listShowLunar');
      const showLunar = listShowLunar ? listShowLunar.checked : false;
      const searchInput = document.getElementById('searchKeyword');
      const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const categorySelect = document.getElementById('categoryFilter');
      const selectedCategory = categorySelect ? categorySelect.value.trim().toLowerCase() : '';
      const modeSelect = document.getElementById('modeFilter');
      const selectedMode = modeSelect ? modeSelect.value : '';

      let filtered = Array.isArray(subscriptionsCache) ? [...subscriptionsCache] : [];

      if (selectedCategory) {
        filtered = filtered.filter(subscription =>
          normalizeCategoryTokens(subscription.category).some(token => token.toLowerCase() === selectedCategory)
        );
      }
      
      if (selectedMode) {
        filtered = filtered.filter(subscription => 
          (subscription.subscriptionMode || 'cycle') === selectedMode
        );
      }

      if (keyword) {
        filtered = filtered.filter(subscription => {
          const haystack = [
            subscription.name,
            subscription.customType,
            subscription.notes,
            subscription.category
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(keyword);
        });
      }

      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">没有符合条件的订阅</td></tr>';
        return;
      }

      filtered.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

      const currentTime = new Date();
      const currentDtf = new Intl.DateTimeFormat('en-US', {
          timeZone: globalTimezone,
          hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit'
      });
      const currentParts = currentDtf.formatToParts(currentTime);
      const getCurrent = type => Number(currentParts.find(x => x.type === type).value);
      const currentDateInTimezone = Date.UTC(getCurrent('year'), getCurrent('month') - 1, getCurrent('day'), 0, 0, 0);

      const displayDtf = new Intl.DateTimeFormat('zh-CN', {
        timeZone: globalTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const fragment = document.createDocumentFragment();

      filtered.forEach(subscription => {
        const row = document.createElement('tr');
        row.className = subscription.isActive === false ? 'hover:bg-gray-50 bg-gray-100' : 'hover:bg-gray-50';

        const calendarTypeHtml = subscription.useLunar
          ? '<div class="text-xs text-purple-600 mt-1">日历类型：农历</div>'
          : '<div class="text-xs text-gray-600 mt-1">日历类型：公历</div>';

        const expiryDate = new Date(subscription.expiryDate);
        
        const expiryParts = currentDtf.formatToParts(expiryDate);
        const getExpiry = type => Number(expiryParts.find(x => x.type === type).value);
        const expiryDateInTimezone = Date.UTC(getExpiry('year'), getExpiry('month') - 1, getExpiry('day'), 0, 0, 0);

        const daysDiff = Math.round((expiryDateInTimezone - currentDateInTimezone) / (1000 * 60 * 60 * 24));
        const diffMs = expiryDate.getTime() - currentTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        const reminder = getReminderSettings(subscription);
        const isSoon = reminder.unit === 'hour'
          ? diffHours >= 0 && diffHours <= reminder.value
          : daysDiff >= 0 && daysDiff <= reminder.value;

        let statusHtml = '';
        if (!subscription.isActive) {
          statusHtml = '<span class="px-2 py-1 text-xs font-medium rounded-full text-white bg-gray-500"><i class="fas fa-pause-circle mr-1"></i>已停用</span>';
        } else if (daysDiff < 0) {
          statusHtml = '<span class="px-2 py-1 text-xs font-medium rounded-full text-white bg-red-500"><i class="fas fa-exclamation-circle mr-1"></i>已过期</span>';
        } else if (isSoon) {
          statusHtml = '<span class="px-2 py-1 text-xs font-medium rounded-full text-white bg-yellow-500"><i class="fas fa-exclamation-triangle mr-1"></i>即将到期</span>';
        } else {
          statusHtml = '<span class="px-2 py-1 text-xs font-medium rounded-full text-white bg-green-500"><i class="fas fa-check-circle mr-1"></i>正常</span>';
        }

        let periodText = '';
        if (subscription.periodValue && subscription.periodUnit) {
          const unitMap = { day: '天', month: '月', year: '年' };
          periodText = subscription.periodValue + ' ' + (unitMap[subscription.periodUnit] || subscription.periodUnit);
        }

        const autoRenewIcon = subscription.autoRenew !== false
          ? '<i class="fas fa-sync-alt text-blue-500 mr-1" title="自动续订"></i>'
          : '<i class="fas fa-ban text-gray-400 mr-1" title="不自动续订"></i>';

        let lunarExpiryText = '';
        let startLunarText = '';
        
        if (showLunar) {
          const getLunarParts = (dateStr) => {
            if (!dateStr) return null;
            const datePart = dateStr.split('T')[0]; 
            const parts = datePart.split('-');
            if (parts.length !== 3) return null;
            return { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10), d: parseInt(parts[2], 10) };
          };

          const expiryParts = getLunarParts(subscription.expiryDate);
          if (expiryParts) {
             const lunarExpiry = lunarCalendar.solar2lunar(expiryParts.y, expiryParts.m, expiryParts.d);
             lunarExpiryText = lunarExpiry ? lunarExpiry.fullStr : '';
          }

          if (subscription.startDate) {
            const startParts = getLunarParts(subscription.startDate);
            if (startParts) {
               const lunarStart = lunarCalendar.solar2lunar(startParts.y, startParts.m, startParts.d);
               startLunarText = lunarStart ? lunarStart.fullStr : '';
            }
          }
        }

        let notesHtml = '';
        if (subscription.notes) {
          const notes = subscription.notes;
          if (notes.length > 50) {
            const truncatedNotes = notes.substring(0, 50) + '...';
            notesHtml = '<div class="notes-container">' +
              '<div class="notes-text text-xs text-gray-500" data-full-notes="' + notes.replace(/"/g, '&quot;') + '">' +
                truncatedNotes +
              '</div>' +
              '<div class="notes-tooltip"></div>' +
            '</div>';
          } else {
            notesHtml = '<div class="text-xs text-gray-500">' + notes + '</div>';
          }
        }

        const nameHtml = createHoverText(subscription.name, 20, 'text-sm font-medium text-gray-900');
        const typeHtml = createHoverText(subscription.customType || '其他', 15, 'text-sm text-gray-900');
        const periodHtml = periodText ? createHoverText('周期: ' + periodText, 20, 'text-xs text-gray-500 mt-1') : '';
        const modeLabel = (subscription.subscriptionMode === 'reset') ? '到期重置' : '循环订阅';
        const modeIconClass = (subscription.subscriptionMode === 'reset') ? 'fa-hourglass-end' : 'fa-sync';
        const modeColorClass = (subscription.subscriptionMode === 'reset') ? 'text-orange-500' : 'text-blue-500';
        const modeHtml = '<div class="text-xs ' + modeColorClass + ' mt-1"><i class="fas ' + modeIconClass + ' mr-1"></i>' + modeLabel + '</div>';

        const categoryTokens = normalizeCategoryTokens(subscription.category);
        const categoryHtml = categoryTokens.length
          ? '<div class="flex flex-wrap gap-2 mt-2">' + categoryTokens.map(cat =>
              '<span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full"><i class="fas fa-tag mr-1"></i>' + cat + '</span>'
            ).join('') + '</div>'
          : '';

        const expiryDateText = displayDtf.format(new Date(subscription.expiryDate));
        const lunarHtml = lunarExpiryText ? createHoverText('农历: ' + lunarExpiryText, 25, 'text-xs text-blue-600 mt-1') : '';

        let daysLeftText = '';
        if (diffMs < 0) {
          const absDays = Math.abs(daysDiff);
          if (absDays >= 1) {
            daysLeftText = '已过期' + absDays + '天';
          } else {
            const absHours = Math.ceil(Math.abs(diffHours));
            daysLeftText = '已过期' + absHours + '小时';
          }
        } else if (daysDiff >= 1) {
          daysLeftText = '还剩' + daysDiff + '天';
        } else {
          const hoursLeft = Math.max(0, Math.ceil(diffHours));
          daysLeftText = hoursLeft > 0 ? '约 ' + hoursLeft + ' 小时后到期' : '即将到期';
        }

        const startDateText = subscription.startDate
          ? '开始: ' + displayDtf.format(new Date(subscription.startDate)) + (startLunarText ? ' (' + startLunarText + ')' : '')
          : '';
        const startDateHtml = startDateText ? createHoverText(startDateText, 30, 'text-xs text-gray-500 mt-1') : '';

        const reminderExtra = reminder.value === 0
          ? '<div class="text-xs text-gray-500 mt-1">仅到期时提醒</div>'
          : (reminder.unit === 'hour' ? '<div class="text-xs text-gray-500 mt-1">小时级提醒</div>' : '');
        const reminderHtml = '<div><i class="fas fa-bell mr-1"></i>' + reminder.displayText + '</div>' + reminderExtra;

        const currencySymbols = {
          'CNY': '¥', 'USD': '$', 'HKD': 'HK$', 'TWD': 'NT$', 
          'JPY': '¥', 'EUR': '€', 'GBP': '£', 'KRW': '₩', 'TRY': '₺'
        };
        const currencySymbol = currencySymbols[subscription.currency] || '¥';

        const amountHtml = subscription.amount
          ? '<div class="flex items-center gap-1">' +
              '<span class="text-xs text-gray-500 font-bold">' + currencySymbol + '</span>' +
              '<span class="text-sm font-medium text-gray-900">' + subscription.amount.toFixed(2) + '</span>' +
            '</div>'
          : '<span class="text-xs text-gray-400">未设置</span>';

        row.innerHTML =
          '<td data-label="名称" class="px-4 py-3"><div class="td-content-wrapper">' +
            nameHtml +
            notesHtml +
          '</div></td>' +
          '<td data-label="类型" class="px-4 py-3"><div class="td-content-wrapper space-y-1">' +
            '<div class="flex items-center gap-1">' +
              '<i class="fas fa-layer-group text-gray-400"></i>' +
              typeHtml +
            '</div>' +
            (periodHtml ? '<div class="flex items-center gap-1">' + autoRenewIcon + periodHtml + '</div>' : '') +
            modeHtml +
            categoryHtml +
            calendarTypeHtml +
          '</div></td>' +
          '<td data-label="到期" class="px-4 py-3"><div class="td-content-wrapper">' +
            '<div class="text-sm text-gray-900">' + expiryDateText + '</div>' +
            lunarHtml +
            '<div class="text-xs text-gray-500 mt-1">' + daysLeftText + '</div>' +
            startDateHtml +
          '</div></td>' +
          '<td data-label="金额" class="px-4 py-3"><div class="td-content-wrapper">' +
            amountHtml +
          '</div></td>' +
          '<td data-label="提醒" class="px-4 py-3"><div class="td-content-wrapper">' +
            reminderHtml +
          '</div></td>' +
          '<td data-label="状态" class="px-4 py-3"><div class="td-content-wrapper">' + statusHtml + '</div></td>' +
          '<td data-label="操作" class="px-4 py-3">' +
            '<div class="action-buttons-wrapper">' +
              '<button class="edit btn-primary text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '"><i class="fas fa-edit mr-1"></i>编辑</button>' +
              '<button class="view-history bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '" title="查看支付历史"><i class="fas fa-history mr-1"></i>历史</button>' +
              '<button class="test-notify btn-info text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '"><i class="fas fa-paper-plane mr-1"></i>测试</button>' +
              '<button class="renew-now btn-success text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '" title="立即续订一个周期"><i class="fas fa-sync-alt mr-1"></i>续订</button>' +
              '<button class="delete btn-danger text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '"><i class="fas fa-trash-alt mr-1"></i>删除</button>' +
              (subscription.isActive
                ? '<button class="toggle-status btn-warning text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '" data-action="deactivate"><i class="fas fa-pause-circle mr-1"></i>停用</button>'
                : '<button class="toggle-status btn-success text-white px-2 py-1 rounded text-xs whitespace-nowrap" data-id="' + subscription.id + '" data-action="activate"><i class="fas fa-play-circle mr-1"></i>启用</button>') +
            '</div>' +
          '</td>';

        fragment.appendChild(row);
      });

      tbody.appendChild(fragment);
      
      document.querySelectorAll('.edit').forEach(button => button.addEventListener('click', editSubscription));
      document.querySelectorAll('.delete').forEach(button => button.addEventListener('click', deleteSubscription));
      document.querySelectorAll('.toggle-status').forEach(button => button.addEventListener('click', toggleSubscriptionStatus));
      document.querySelectorAll('.test-notify').forEach(button => button.addEventListener('click', testSubscriptionNotification));
      document.querySelectorAll('.renew-now').forEach(button => button.addEventListener('click', renewSubscriptionNow));
      document.querySelectorAll('.view-history').forEach(button => button.addEventListener('click', viewPaymentHistory));

      if (window.matchMedia('(hover: hover)').matches) attachHoverListeners();
    }

    // ==================== 订阅操作 ====================
    async function loadSubscriptions(showLoading = true) {
      try {
        const listShowLunar = document.getElementById('listShowLunar');
        const saved = localStorage.getItem('showLunar');
        if (listShowLunar) {
          listShowLunar.checked = saved !== null ? saved === 'true' : true;
        }

        const tbody = document.getElementById('subscriptionsBody');
        if (tbody && showLoading) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</td></tr>';
        }

        const response = await fetch('/api/subscriptions');
        const data = await response.json();

        subscriptionsCache = Array.isArray(data) ? data : [];
        populateCategoryFilter(subscriptionsCache);
        renderSubscriptionTable();
      } catch (error) {
        console.error('加载订阅失败:', error);
        const tbody = document.getElementById('subscriptionsBody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-500"><i class="fas fa-exclamation-circle mr-2"></i>加载失败，请刷新页面重试</td></tr>';
        }
        showToast('加载订阅列表失败', 'error');
      }
    }

    async function editSubscription(e) {
      const id = e.target.dataset.id || e.target.parentElement.dataset.id;
      
      try {
        const response = await fetch('/api/subscriptions/' + id);
        const subscription = await response.json();
        
        if (subscription) {
          document.getElementById('modalTitle').textContent = '编辑订阅';
          document.getElementById('subscriptionId').value = subscription.id;
          document.getElementById('name').value = subscription.name;
          document.getElementById('subscriptionMode').value = subscription.subscriptionMode || 'cycle';
          document.getElementById('customType').value = subscription.customType || '';
          document.getElementById('category').value = subscription.category || '';
          document.getElementById('notes').value = subscription.notes || '';
          document.getElementById('amount').value = subscription.amount || '';
          document.getElementById('currency').value = subscription.currency || 'CNY';
          document.getElementById('isActive').checked = subscription.isActive !== false;
          document.getElementById('autoRenew').checked = subscription.autoRenew !== false;
          document.getElementById('startDate').value = subscription.startDate ? subscription.startDate.split('T')[0] : '';
          document.getElementById('expiryDate').value = subscription.expiryDate ? subscription.expiryDate.split('T')[0] : '';
          document.getElementById('periodValue').value = subscription.periodValue || 1;
          document.getElementById('periodUnit').value = subscription.periodUnit || 'month';
          
          const reminderUnit = subscription.reminderUnit || (subscription.reminderHours !== undefined ? 'hour' : 'day');
          let reminderValue;
          if (reminderUnit === 'hour') {
            reminderValue = subscription.reminderValue !== undefined ? subscription.reminderValue : 
                           (subscription.reminderHours !== undefined ? subscription.reminderHours : 0);
          } else {
            reminderValue = subscription.reminderValue !== undefined ? subscription.reminderValue : 
                           (subscription.reminderDays !== undefined ? subscription.reminderDays : 7);
          }
          document.getElementById('reminderUnit').value = reminderUnit;
          document.getElementById('reminderValue').value = reminderValue;
          document.getElementById('useLunar').checked = !!subscription.useLunar;
          
          clearFieldErrors();
          loadLunarPreference();
          document.getElementById('subscriptionModal').classList.remove('hidden');
          document.body.classList.add('overflow-hidden');
          
          setupModalEventListeners();

          setTimeout(() => {
            updateLunarDisplay('startDate', 'startDateLunar');
            updateLunarDisplay('expiryDate', 'expiryDateLunar');
          }, 100);
        }
      } catch (error) {
        console.error('获取订阅信息失败:', error);
        showToast('获取订阅信息失败', 'error');
      }
    }

    async function deleteSubscription(e) {
      const id = e.target.dataset.id || e.target.parentElement.dataset.id;
      
      if (!confirm('确定要删除这个订阅吗？此操作不可恢复。')) return;
      
      const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
      const originalContent = button.innerHTML;
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>删除中...';
      button.disabled = true;
      
      try {
        const response = await fetch('/api/subscriptions/' + id, { method: 'DELETE' });
        if (response.ok) {
          showToast('删除成功', 'success');
          loadSubscriptions();
        } else {
          const error = await response.json();
          showToast('删除失败: ' + (error.message || '未知错误'), 'error');
          button.innerHTML = originalContent;
          button.disabled = false;
        }
      } catch (error) {
        console.error('删除订阅失败:', error);
        showToast('删除失败，请稍后再试', 'error');
        button.innerHTML = originalContent;
        button.disabled = false;
      }
    }

    async function toggleSubscriptionStatus(e) {
      const id = e.target.dataset.id || e.target.parentElement.dataset.id;
      const action = e.target.dataset.action || e.target.parentElement.dataset.action;
      const isActivate = action === 'activate';
      
      const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
      const originalContent = button.innerHTML;
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + (isActivate ? '启用中...' : '停用中...');
      button.disabled = true;
      
      try {
        const response = await fetch('/api/subscriptions/' + id + '/toggle-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: isActivate })
        });
        
        if (response.ok) {
          showToast((isActivate ? '启用' : '停用') + '成功', 'success');
          loadSubscriptions();
        } else {
          const error = await response.json();
          showToast((isActivate ? '启用' : '停用') + '失败: ' + (error.message || '未知错误'), 'error');
          button.innerHTML = originalContent;
          button.disabled = false;
        }
      } catch (error) {
        console.error((isActivate ? '启用' : '停用') + '订阅失败:', error);
        showToast((isActivate ? '启用' : '停用') + '失败，请稍后再试', 'error');
        button.innerHTML = originalContent;
        button.disabled = false;
      }
    }

    async function testSubscriptionNotification(e) {
      const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
      const id = button.dataset.id;
      const originalContent = button.innerHTML;
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>';
      button.disabled = true;

      try {
        const response = await fetch('/api/subscriptions/' + id + '/test-notify', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
          showToast(result.message || '测试通知已发送', 'success');
        } else {
          showToast(result.message || '测试通知发送失败', 'error');
        }
      } catch (error) {
        console.error('测试通知失败:', error);
        showToast('发送测试通知时发生错误', 'error');
      } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
      }
    }

    async function renewSubscriptionNow(e) {
      const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
      const id = button.dataset.id;

      try {
        const response = await fetch('/api/subscriptions/' + id);
        const subscription = await response.json();
        showRenewFormModal(subscription);
      } catch (error) {
        console.error('获取订阅信息失败:', error);
        showToast('获取订阅信息时发生错误', 'error');
      }
    }

    function showRenewFormModal(subscription) {
      const today = new Date().toISOString().split('T')[0];
      
      let currentExpiryDisplay = '无';
      if (subscription.expiryDate) {
        const datePart = subscription.expiryDate.split('T')[0];
        currentExpiryDisplay = datePart;
        if (subscription.useLunar) {
          try {
            const parts = datePart.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            const lunarObj = lunarCalendar.solar2lunar(y, m, d);
            if (lunarObj) {
              currentExpiryDisplay += ' (农历: ' + lunarObj.fullStr + ')';
            }
          } catch (e) { console.error('农历计算失败', e); }
        }
      }

      const defaultAmount = subscription.amount || 0;
      
      const currencySymbols = {
        'CNY': '¥', 'USD': '$', 'HKD': 'HK$', 'TWD': 'NT$', 
        'JPY': '¥', 'EUR': '€', 'GBP': '£', 'KRW': '₩', 'TRY': '₺'
      };
      const currency = subscription.currency || 'CNY';
      const symbol = currencySymbols[currency] || '¥';
      const currencyLabel = "(" + currency + " " + symbol + ")";
      
      const lunarBadge = subscription.useLunar ? 
        '<span class="text-sm bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200 shrink-0">农历周期</span>' : '';

      const modalHtml = 
        '<div id="renewFormModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onclick="closeRenewFormModal(event)">' +
        '    <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white" onclick="event.stopPropagation()">' +
        '        <div class="flex justify-between items-center pb-3 border-b">' +
        '            <h3 class="text-xl font-semibold text-gray-900">' +
        '                <i class="fas fa-sync-alt mr-2"></i>手动续订 - ' + subscription.name +
        '            </h3>' +
        '            <button onclick="closeRenewFormModal()" class="text-gray-400 hover:text-gray-500">' +
        '                <i class="fas fa-times text-2xl"></i>' +
        '            </button>' +
        '        </div>' +
        '        <form id="renewForm" class="mt-4 space-y-4">' +
        '            <div>' +
        '                <label class="block text-sm font-medium text-gray-700 mb-1">支付日期</label>' +
        '                <input type="date" id="renewPaymentDate" value="' + today + '"' +
        '                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">' +
        '            </div>' +
        '            <div>' +
        '                <label class="block text-sm font-medium text-gray-700 mb-1">支付金额 ' + currencyLabel + '</label>' +
        '                <input type="number" id="renewAmount" value="' + defaultAmount + '" step="0.01" min="0"' +
        '                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">' +
        '            </div>' +
        '            <div>' +
        '                <div class="flex justify-between items-center mb-1">' +
        '                    <label class="block text-sm font-medium text-gray-700">续订周期数</label>' +
        '                    ' + lunarBadge + 
        '                </div>' +
        '                <div class="flex items-center space-x-2">' +
        '                    <input type="number" id="renewPeriodMultiplier" value="1" min="1" max="120"' +
        '                           class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"' +
        '                           oninput="updateNewExpiryPreview()">' +
        '                    <span class="text-gray-600">个</span>' + 
        '                </div>' +
        '                <p class="mt-1 text-xs text-gray-500">一次性续订多个周期（如12个月）</p>' +
        '            </div>' +
        '            <div class="bg-blue-50 rounded-lg p-4 mb-4">' +
        '                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-3 sm:mb-2">' +
        '                    <span class="text-gray-500 text-sm shrink-0">当前到期:</span>' +
        '                    <span class="font-medium text-gray-900 text-sm break-words">' + currentExpiryDisplay + '</span>' +
        '                </div>' +
        '                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">' +
        '                    <span class="text-gray-500 text-sm shrink-0">新到期日:</span>' +
        '                    <span class="font-medium text-blue-600 text-sm break-words" id="newExpiryPreview">计算中...</span>' +
        '                </div>' +
        '            </div>' +
        '            <div>' +
        '                <label class="block text-sm font-medium text-gray-700 mb-1">备注 (可选)</label>' +
        '                <input type="text" id="renewNote" placeholder="例如：年度优惠、价格调整"' +
        '                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">' +
        '            </div>' +
        '            <div class="flex justify-end space-x-3 pt-3">' +
        '                <button type="button" onclick="closeRenewFormModal()"' +
        '                        class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md">' +
        '                    取消' +
        '                </button>' +
        '                <button type="submit" id="confirmRenewBtn"' +
        '                        class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md">' +
        '                    <i class="fas fa-check mr-1"></i>确认续订' +
        '                </button>' +
        '            </div>' +
        '        </form>' +
        '    </div>' +
        '</div>';

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      document.getElementById('renewForm').dataset.subscriptionId = subscription.id;
      document.getElementById('renewForm').dataset.subscriptionData = JSON.stringify(subscription);
      updateNewExpiryPreview();
      document.getElementById('renewForm').addEventListener('submit', handleRenewFormSubmit);
      document.getElementById('renewPeriodMultiplier').addEventListener('input', updateNewExpiryPreview);
    }

    function updateNewExpiryPreview() {
      const form = document.getElementById('renewForm');
      if (!form) return;

      const subscription = JSON.parse(form.dataset.subscriptionData);
      const multiplier = parseInt(document.getElementById('renewPeriodMultiplier').value) || 1;

      const getDateParts = (dateStr) => {
        if (!dateStr) return { year: 2024, month: 1, day: 1 };
        const part = dateStr.split('T')[0];
        const parts = part.split('-');
        return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
      };

      const parts = getDateParts(subscription.expiryDate);
      
      if (subscription.useLunar) {
        try {
          let lunar = lunarCalendar.solar2lunar(parts.year, parts.month, parts.day);
          if (lunar) {
            let nextLunar = lunar;
            for(let i = 0; i < multiplier; i++) {
              nextLunar = addLunarPeriod(nextLunar, subscription.periodValue, subscription.periodUnit);
            }
            const solar = lunar2solar(nextLunar);
            const fullNextLunar = lunarCalendar.solar2lunar(solar.year, solar.month, solar.day);
            const resultStr = solar.year + '-' + 
                              String(solar.month).padStart(2, '0') + '-' + 
                              String(solar.day).padStart(2, '0');
            document.getElementById('newExpiryPreview').textContent = resultStr + ' (农历: ' + fullNextLunar.fullStr + ')';
          } else {
            document.getElementById('newExpiryPreview').textContent = '日期计算错误';
          }
        } catch (e) {
          console.error(e);
          document.getElementById('newExpiryPreview').textContent = '计算出错';
        }
      } else {
        const tempDate = new Date(parts.year, parts.month - 1, parts.day);
        const totalPeriodValue = subscription.periodValue * multiplier;
        
        if (subscription.periodUnit === 'day') {
          tempDate.setDate(tempDate.getDate() + totalPeriodValue);
        } else if (subscription.periodUnit === 'month') {
          tempDate.setMonth(tempDate.getMonth() + totalPeriodValue);
        } else if (subscription.periodUnit === 'year') {
          tempDate.setFullYear(tempDate.getFullYear() + totalPeriodValue);
        }
        
        const y = tempDate.getFullYear();
        const m = String(tempDate.getMonth() + 1).padStart(2, '0');
        const d = String(tempDate.getDate()).padStart(2, '0');
        document.getElementById('newExpiryPreview').textContent = y + '-' + m + '-' + d;
      }
    }

    async function handleRenewFormSubmit(e) {
      e.preventDefault();

      const form = e.target;
      const subscriptionId = form.dataset.subscriptionId;
      const confirmBtn = document.getElementById('confirmRenewBtn');

      const options = {
        paymentDate: document.getElementById('renewPaymentDate').value,
        amount: parseFloat(document.getElementById('renewAmount').value) || 0,
        periodMultiplier: parseInt(document.getElementById('renewPeriodMultiplier').value) || 1,
        note: document.getElementById('renewNote').value || '手动续订'
      };

      const originalBtnContent = confirmBtn.innerHTML;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>续订中...';
      confirmBtn.disabled = true;

      try {
        const response = await fetch('/api/subscriptions/' + subscriptionId + '/renew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
        const result = await response.json();

        if (result.success) {
          showToast(result.message || '续订成功', 'success');
          closeRenewFormModal();
          await loadSubscriptions(false);
        } else {
          showToast(result.message || '续订失败', 'error');
          confirmBtn.innerHTML = originalBtnContent;
          confirmBtn.disabled = false;
        }
      } catch (error) {
        console.error('续订失败:', error);
        showToast('续订时发生错误', 'error');
        confirmBtn.innerHTML = originalBtnContent;
        confirmBtn.disabled = false;
      }
    }

    window.closeRenewFormModal = function(event) {
      if (event && event.target.id !== 'renewFormModal') return;
      const modal = document.getElementById('renewFormModal');
      if (modal) modal.remove();
    };

    async function viewPaymentHistory(e) {
      const button = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
      const id = button.dataset.id;

      try {
        const response = await fetch('/api/subscriptions/' + id + '/payments');
        const result = await response.json();

        if (!result.success) {
          showToast(result.message || '获取支付历史失败', 'error');
          return;
        }

        const payments = result.payments || [];
        const subscriptionResponse = await fetch('/api/subscriptions/' + id);
        const subscriptionData = await subscriptionResponse.json();
        const subscription = subscriptionData;

        const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const paymentCount = payments.length;

        let paymentsHtml = '';
        if (payments.length === 0) {
          paymentsHtml = '<div class="text-center text-gray-500 py-8">暂无支付记录</div>';
        } else {
          paymentsHtml = payments.reverse().map(payment => {
            const typeLabel = payment.type === 'initial' ? '初始订阅' :
                            payment.type === 'manual' ? '手动续订' :
                            payment.type === 'auto' ? '自动续订' : '未知';
            const typeClass = payment.type === 'initial' ? 'bg-blue-100 text-blue-800' :
                            payment.type === 'manual' ? 'bg-green-100 text-green-800' :
                            payment.type === 'auto' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800';
            const date = new Date(payment.date);
            const formattedDate = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const formattedTime = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

            let periodHtml = '';
            if (payment.periodStart && payment.periodEnd) {
              const periodStart = new Date(payment.periodStart);
              const periodEnd = new Date(payment.periodEnd);
              const options = { year: 'numeric', month: 'short', day: 'numeric' };
              const startStr = periodStart.toLocaleDateString('zh-CN', options);
              const endStr = periodEnd.toLocaleDateString('zh-CN', options);
              periodHtml = '<div class="mt-1 ml-6 text-xs text-gray-500"><i class="fas fa-clock mr-1"></i>计费周期: ' + startStr + ' - ' + endStr + '</div>';
            }

            const noteHtml = payment.note ? '<div class="mt-1 ml-6 text-sm text-gray-600">' + payment.note + '</div>' : '';
            
            return `
              <div class="border-b border-gray-200 py-3 hover:bg-gray-50">
                <div class="flex justify-between items-start gap-3">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <i class="fas fa-calendar-alt text-gray-400"></i>
                      <span class="font-medium">${formattedDate} ${formattedTime}</span>
                      <span class="px-2 py-1 rounded text-xs font-medium ${typeClass}">${typeLabel}</span>
                    </div>
                    ${periodHtml}
                    ${noteHtml}
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right">
                      <div class="text-lg font-bold text-gray-900">¥${payment.amount.toFixed(2)}</div>
                    </div>
                    <div class="flex gap-1">
                      <button onclick="editPaymentRecord('${subscription.id}', '${payment.id}')"
                              class="text-blue-600 hover:text-blue-800 px-2 py-1"
                              title="编辑">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button onclick="deletePaymentRecord('${subscription.id}', '${payment.id}')"
                              class="text-red-600 hover:text-red-800 px-2 py-1"
                              title="删除">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }

        const modalHtml = `
          <div id="paymentHistoryModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onclick="closePaymentHistoryModal(event)">
            <div class="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white" onclick="event.stopPropagation()">
              <div class="flex justify-between items-center pb-3 border-b">
                <h3 class="text-xl font-semibold text-gray-900">
                  <i class="fas fa-history mr-2"></i>${subscription.name} - 支付历史
                </h3>
                <button onclick="closePaymentHistoryModal()" class="text-gray-400 hover:text-gray-500">
                  <i class="fas fa-times text-2xl"></i>
                </button>
              </div>

              <div class="mt-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4">
                  <div class="text-center">
                    <div class="text-sm text-gray-600">累计支出</div>
                    <div class="text-2xl font-bold text-purple-600">¥${totalAmount.toFixed(2)}</div>
                  </div>
                  <div class="text-center">
                    <div class="text-sm text-gray-600">支付次数</div>
                    <div class="text-2xl font-bold text-blue-600">${paymentCount}</div>
                  </div>
                </div>
              </div>

              <div class="mt-4 max-h-96 overflow-y-auto">
                ${paymentsHtml}
              </div>

              <div class="mt-4 flex justify-end">
                <button onclick="closePaymentHistoryModal()" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
                  关闭
                </button>
              </div>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
      } catch (error) {
        console.error('获取支付历史失败:', error);
        showToast('获取支付历史时发生错误', 'error');
      }
    }

    window.closePaymentHistoryModal = function(event) {
      if (event && event.target.id !== 'paymentHistoryModal') return;
      const modal = document.getElementById('paymentHistoryModal');
      if (modal) modal.remove();
    };

    window.deletePaymentRecord = async function(subscriptionId, paymentId) {
      if (!confirm('确认删除此支付记录？删除后将重新计算统计数据。')) return;

      try {
        const response = await fetch('/api/subscriptions/' + subscriptionId + '/payments/' + paymentId, { method: 'DELETE' });
        const result = await response.json();

        if (result.success) {
          showToast(result.message || '支付记录已删除', 'success');
          closePaymentHistoryModal();
          await loadSubscriptions(false);
        } else {
          showToast(result.message || '删除失败', 'error');
        }
      } catch (error) {
        console.error('删除支付记录失败:', error);
        showToast('删除时发生错误', 'error');
      }
    };

    window.editPaymentRecord = async function(subscriptionId, paymentId) {
      try {
        const subResponse = await fetch('/api/subscriptions/' + subscriptionId);
        const subscription = await subResponse.json();

        const payResponse = await fetch('/api/subscriptions/' + subscriptionId + '/payments');
        const payResult = await payResponse.json();

        const payment = payResult.payments.find(p => p.id === paymentId);
        if (!payment) {
          showToast('支付记录不存在', 'error');
          return;
        }

        const paymentDate = new Date(payment.date);
        const formattedDate = paymentDate.toISOString().split('T')[0];

        const modalHtml = `
          <div id="editPaymentModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onclick="closeEditPaymentModal(event)">
            <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white" onclick="event.stopPropagation()">
              <div class="flex justify-between items-center pb-3 border-b">
                <h3 class="text-xl font-semibold text-gray-900">
                  <i class="fas fa-edit mr-2"></i>编辑支付记录
                </h3>
                <button onclick="closeEditPaymentModal()" class="text-gray-400 hover:text-gray-500">
                  <i class="fas fa-times text-2xl"></i>
                </button>
              </div>

              <form id="editPaymentForm" class="mt-4 space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">订阅名称</label>
                  <input type="text" value="${subscription.name}" disabled
                         class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100">
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">支付日期</label>
                  <input type="date" id="editPaymentDate" value="${formattedDate}"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">支付金额 (¥)</label>
                  <input type="number" id="editPaymentAmount" value="${payment.amount}" step="0.01" min="0"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input type="text" id="editPaymentNote" value="${payment.note || ''}"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                </div>

                <div class="flex justify-end space-x-3 pt-3">
                  <button type="button" onclick="closeEditPaymentModal()"
                          class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md">
                    取消
                  </button>
                  <button type="submit" id="confirmEditBtn"
                          class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md">
                    <i class="fas fa-check mr-1"></i>保存
                  </button>
                </div>
              </form>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('editPaymentForm').dataset.subscriptionId = subscription.id;
        document.getElementById('editPaymentForm').dataset.paymentId = payment.id;
        document.getElementById('editPaymentForm').addEventListener('submit', handleEditPaymentSubmit);
      } catch (error) {
        console.error('获取支付记录失败:', error);
        showToast('获取支付记录时发生错误', 'error');
      }
    };

    async function handleEditPaymentSubmit(e) {
      e.preventDefault();

      const form = e.target;
      const subscriptionId = form.dataset.subscriptionId;
      const paymentId = form.dataset.paymentId;
      const confirmBtn = document.getElementById('confirmEditBtn');

      const paymentData = {
        date: document.getElementById('editPaymentDate').value,
        amount: parseFloat(document.getElementById('editPaymentAmount').value) || 0,
        note: document.getElementById('editPaymentNote').value
      };

      const originalBtnContent = confirmBtn.innerHTML;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>保存中...';
      confirmBtn.disabled = true;

      try {
        const response = await fetch('/api/subscriptions/' + subscriptionId + '/payments/' + paymentId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentData)
        });
        const result = await response.json();

        if (result.success) {
          showToast(result.message || '支付记录已更新', 'success');
          closeEditPaymentModal();
          closePaymentHistoryModal();
          await loadSubscriptions(false);
        } else {
          showToast(result.message || '更新失败', 'error');
          confirmBtn.innerHTML = originalBtnContent;
          confirmBtn.disabled = false;
        }
      } catch (error) {
        console.error('更新支付记录失败:', error);
        showToast('更新时发生错误', 'error');
        confirmBtn.innerHTML = originalBtnContent;
        confirmBtn.disabled = false;
      }
    }

    window.closeEditPaymentModal = function(event) {
      if (event && event.target.id !== 'editPaymentModal') return;
      const modal = document.getElementById('editPaymentModal');
      if (modal) modal.remove();
    };

    function calculateExpiryDate() {
      const startDate = document.getElementById('startDate').value;
      const periodValue = parseInt(document.getElementById('periodValue').value);
      const periodUnit = document.getElementById('periodUnit').value;
      const useLunar = document.getElementById('useLunar').checked;

      if (!startDate || !periodValue || !periodUnit) return;

      if (useLunar) {
        const start = new Date(startDate);
        const lunar = lunarCalendar.solar2lunar(start.getFullYear(), start.getMonth() + 1, start.getDate());
        let nextLunar = addLunarPeriod(lunar, periodValue, periodUnit);
        const solar = lunar2solar(nextLunar);
        
        const expiry = new Date(startDate);
        expiry.setFullYear(solar.year);
        expiry.setMonth(solar.month - 1);
        expiry.setDate(solar.day);
        document.getElementById('expiryDate').value = expiry.toISOString().split('T')[0];
      } else {
        const start = new Date(startDate);
        const expiry = new Date(start);
        if (periodUnit === 'day') {
          expiry.setDate(start.getDate() + periodValue);
        } else if (periodUnit === 'month') {
          expiry.setMonth(start.getMonth() + periodValue);
        } else if (periodUnit === 'year') {
          expiry.setFullYear(start.getFullYear() + periodValue);
        }
        document.getElementById('expiryDate').value = expiry.toISOString().split('T')[0];
      }

      updateLunarDisplay('startDate', 'startDateLunar');
      updateLunarDisplay('expiryDate', 'expiryDateLunar');
    }

    function setupModalEventListeners() {     
      const calculateExpiryBtn = document.getElementById('calculateExpiryBtn');
      const useLunar = document.getElementById('useLunar');
      const showLunar = document.getElementById('showLunar');
      const startDate = document.getElementById('startDate');
      const expiryDate = document.getElementById('expiryDate');
      const cancelBtn = document.getElementById('cancelBtn');
      
      initCustomDropdown('customType', 'customTypeDropdown', TYPE_OPTIONS);
      initCustomDropdown('category', 'categoryDropdown', CATEGORY_OPTIONS);    
      
      if (calculateExpiryBtn) calculateExpiryBtn.addEventListener('click', calculateExpiryDate);
      if (useLunar) useLunar.addEventListener('change', calculateExpiryDate);
      if (showLunar) showLunar.addEventListener('change', toggleLunarDisplay);
      if (startDate) startDate.addEventListener('change', () => updateLunarDisplay('startDate', 'startDateLunar'));
      if (expiryDate) expiryDate.addEventListener('change', () => updateLunarDisplay('expiryDate', 'expiryDateLunar'));
      if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('subscriptionModal').classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      });

      ['startDate', 'periodValue', 'periodUnit'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', calculateExpiryDate);
      });

      setTimeout(() => {
        if (window.startDatePicker && typeof window.startDatePicker.destroy === 'function') {
          window.startDatePicker.destroy();
        }
        if (window.expiryDatePicker && typeof window.expiryDatePicker.destroy === 'function') {
          window.expiryDatePicker.destroy();
        }
        
        window.startDatePicker = new CustomDatePicker(
          'startDate', 'startDatePicker', 'startDateCalendar', 
          'startDateMonth', 'startDateYear', 'startDatePrevMonth', 'startDateNextMonth'
        );
        window.expiryDatePicker = new CustomDatePicker(
          'expiryDate', 'expiryDatePicker', 'expiryDateCalendar', 
          'expiryDateMonth', 'expiryDateYear', 'expiryDatePrevMonth', 'expiryDateNextMonth'
        );
      }, 50);
    }

    // ==================== 时间显示 ====================
    async function showSystemTime() {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        globalTimezone = config.TIMEZONE || 'UTC';
        
        function formatTime(dt, tz) {
          return dt.toLocaleString('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        function formatTimezoneDisplay(tz) {
          try {
            const now = new Date();
            const dtf = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour12: false,
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const parts = dtf.formatToParts(now);
            const get = type => Number(parts.find(x => x.type === type).value);
            const target = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
            const utc = now.getTime();
            const offset = Math.round((target - utc) / (1000 * 60 * 60));
            
            const timezoneNames = {
              'UTC': '世界标准时间',
              'Asia/Shanghai': '中国标准时间',
              'Asia/Hong_Kong': '香港时间',
              'Asia/Taipei': '台北时间',
              'Asia/Singapore': '新加坡时间',
              'Asia/Tokyo': '日本时间',
              'Asia/Seoul': '韩国时间',
              'America/New_York': '美国东部时间',
              'America/Los_Angeles': '美国太平洋时间',
              'America/Chicago': '美国中部时间',
              'America/Denver': '美国山地时间',
              'Europe/London': '英国时间',
              'Europe/Paris': '巴黎时间',
              'Europe/Berlin': '柏林时间',
              'Europe/Moscow': '莫斯科时间',
              'Australia/Sydney': '悉尼时间',
              'Australia/Melbourne': '墨尔本时间',
              'Pacific/Auckland': '奥克兰时间'
            };
            
            const offsetStr = offset >= 0 ? '+' + offset : offset;
            const timezoneName = timezoneNames[tz] || tz;
            return timezoneName + ' (UTC' + offsetStr + ')';
          } catch (error) {
            console.error('格式化时区显示失败:', error);
            return tz;
          }
        }
        function update() {
          const now = new Date();
          const timeStr = formatTime(now, globalTimezone);
          const tzStr = formatTimezoneDisplay(globalTimezone);
          const el = document.getElementById('systemTimeDisplay');
          if (el) el.textContent = timeStr + '  ' + tzStr;
          const mobileEl = document.getElementById('mobileTimeDisplay');
          if (mobileEl) mobileEl.textContent = timeStr + ' ' + tzStr;
        }
        update();
        setInterval(update, 1000);
      } catch (e) {
        console.error('时间显示错误:', e);
        const el = document.getElementById('systemTimeDisplay');
        if (el) el.textContent = new Date().toLocaleString();
      }
    }

    // ==================== 初始化 ====================
    document.getElementById('addSubscriptionBtn').addEventListener('click', () => {
      document.getElementById('modalTitle').textContent = '添加新订阅';
      document.getElementById('subscriptionModal').classList.remove('hidden');
      document.body.classList.add('overflow-hidden');

      document.getElementById('subscriptionForm').reset();
      document.getElementById('currency').value = 'CNY';
      document.getElementById('subscriptionId').value = '';
      clearFieldErrors();

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('startDate').value = today;
      document.getElementById('category').value = '';
      document.getElementById('reminderValue').value = '7';
      document.getElementById('reminderUnit').value = 'day';
      document.getElementById('isActive').checked = true;
      document.getElementById('autoRenew').checked = true;

      loadLunarPreference();
      calculateExpiryDate();
      setupModalEventListeners();
    });

    document.getElementById('closeModal').addEventListener('click', () => {
      document.getElementById('subscriptionModal').classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    });

    document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!validateForm()) return;
      
      const id = document.getElementById('subscriptionId').value;
      const reminderUnit = document.getElementById('reminderUnit').value;
      const reminderValue = Number(document.getElementById('reminderValue').value) || 0;

      const subscription = {
        name: document.getElementById('name').value.trim(),
        customType: document.getElementById('customType').value.trim(),
        category: document.getElementById('category').value.trim(),
        subscriptionMode: document.getElementById('subscriptionMode').value,
        notes: document.getElementById('notes').value.trim() || '',
        currency: document.getElementById('currency').value,
        amount: document.getElementById('amount').value ? parseFloat(document.getElementById('amount').value) : null,
        isActive: document.getElementById('isActive').checked,
        autoRenew: document.getElementById('autoRenew').checked,
        startDate: document.getElementById('startDate').value,
        expiryDate: document.getElementById('expiryDate').value,
        periodValue: Number(document.getElementById('periodValue').value),
        periodUnit: document.getElementById('periodUnit').value,
        reminderUnit: reminderUnit,
        reminderValue: reminderValue,
        reminderDays: reminderUnit === 'day' ? reminderValue : 0,
        reminderHours: reminderUnit === 'hour' ? reminderValue : undefined,
        useLunar: document.getElementById('useLunar').checked
      };
      
      const submitButton = e.target.querySelector('button[type="submit"]');
      const originalContent = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + (id ? '更新中...' : '保存中...');
      submitButton.disabled = true;
      
      try {
        const url = id ? '/api/subscriptions/' + id : '/api/subscriptions';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });
        
        const result = await response.json();
        
        if (result.success) {
          showToast((id ? '更新' : '添加') + '订阅成功', 'success');
          document.getElementById('subscriptionModal').classList.add('hidden');
          document.body.classList.remove('overflow-hidden');
          loadSubscriptions();
        } else {
          showToast((id ? '更新' : '添加') + '订阅失败: ' + (result.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error((id ? '更新' : '添加') + '订阅失败:', error);
        showToast((id ? '更新' : '添加') + '订阅失败，请稍后再试', 'error');
      } finally {
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
      }
    });

    const searchInput = document.getElementById('searchKeyword');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => renderSubscriptionTable(), 200);
      });
    }

    const categorySelect = document.getElementById('categoryFilter');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => renderSubscriptionTable());
    }

    const modeSelect = document.getElementById('modeFilter');
    if (modeSelect) {
      modeSelect.addEventListener('change', () => renderSubscriptionTable());
    }

    document.getElementById('listShowLunar').addEventListener('change', () => {
      localStorage.setItem('showLunar', document.getElementById('listShowLunar').checked);
      renderSubscriptionTable();
    });

    function checkTimezoneUpdate() {
      const lastUpdate = localStorage.getItem('timezoneUpdated');
      if (lastUpdate) {
        const updateTime = parseInt(lastUpdate);
        const currentTime = Date.now();
        if (currentTime - updateTime < 5000) {
          localStorage.removeItem('timezoneUpdated');
          window.location.reload();
        }
      }
    }

    window.addEventListener('load', () => {
      checkTimezoneUpdate();
      loadSubscriptions();
      showSystemTime();
    });

    setInterval(checkTimezoneUpdate, 2000);

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        const icon = mobileMenuBtn.querySelector('i');
        if (mobileMenu.classList.contains('hidden')) {
          icon.classList.remove('fa-times');
          icon.classList.add('fa-bars');
        } else {
          icon.classList.remove('fa-bars');
          icon.classList.add('fa-times');
        }
      });           
      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
        });
      });
    }
  </script>
</body>
</html>`;

const configPage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>系统配置 - 订阅管理系统</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  ${themeResources}
  <style>
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: all 0.3s; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .btn-secondary { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); transition: all 0.3s; }
    .btn-secondary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    
    .toast {
      position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px;
      color: white; font-weight: 500; z-index: 1000; transform: translateX(400px);
      transition: all 0.3s ease-in-out; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .toast.show { transform: translateX(0); }
    .toast.success { background-color: #10b981; }
    .toast.error { background-color: #ef4444; }
    .toast.info { background-color: #3b82f6; }
    .toast.warning { background-color: #f59e0b; }
    
    .config-section { 
      border: 1px solid #e5e7eb; 
      border-radius: 8px; 
      padding: 16px; 
      margin-bottom: 24px; 
    }
    .config-section.active { 
      background-color: #f8fafc; 
      border-color: #6366f1; 
    }
    .config-section.inactive { 
      background-color: #f9fafb; 
      opacity: 0.7; 
    }
    html.dark .config-section { border-color: #374151; }
    html.dark .config-section.active {
      background-color: rgba(31, 41, 55, 0.5);
      border-color: #818cf8;
    }
    html.dark .config-section.inactive { background-color: #111827; opacity: 0.5; }
    html.dark .bg-indigo-50 {
        background-color: rgba(55, 65, 81, 0.5) !important;
        border-color: #4b5563 !important;
    }
    html.dark .text-indigo-700 { color: #a5b4fc !important; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div id="toast-container"></div>

  <nav class="bg-white shadow-md relative z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center shrink-0">
          <div class="flex items-center">
            <i class="fas fa-calendar-check text-indigo-600 text-2xl mr-2"></i>
            <span class="font-bold text-xl text-gray-800">订阅管理系统</span>
          </div>
          <span id="systemTimeDisplay" class="ml-4 text-base text-indigo-600 font-normal hidden md:block pt-1"></span>
        </div>
          
        <div class="hidden md:flex items-center space-x-4 ml-auto">
          <a href="/admin/dashboard" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-chart-line mr-1"></i>仪表盘
          </a>
          <a href="/admin" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-list mr-1"></i>订阅列表
          </a>
          <a href="/admin/config" class="text-indigo-600 border-b-2 border-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-cog mr-1"></i>系统配置
          </a>
          <a href="/api/logout" class="text-gray-700 hover:text-red-600 border-b-2 border-transparent hover:border-red-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-sign-out-alt mr-1"></i>退出登录
          </a>
        </div>

        <div class="flex items-center md:hidden ml-auto">
          <button id="mobile-menu-btn" type="button" class="text-gray-600 hover:text-indigo-600 focus:outline-none p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <i class="fas fa-bars text-xl"></i>
          </button>
        </div>
      </div>
    </div>

    <div id="mobile-menu" class="hidden md:hidden bg-white border-t border-b border-gray-200 w-full">
      <div class="px-4 pt-2 pb-4 space-y-2">
        <div id="mobileTimeDisplay" class="px-3 py-2 text-xs text-indigo-600 text-right border-b border-gray-100 mb-2"></div>
        <a href="/admin/dashboard" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-chart-line w-6 text-center mr-2"></i>仪表盘
        </a>
        <a href="/admin" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-list w-6 text-center mr-2"></i>订阅列表
        </a>
        <a href="/admin/config" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-cog w-6 text-center mr-2"></i>系统配置
        </a>
        <a href="/api/logout" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 active:bg-red-100 transition-colors">
          <i class="fas fa-sign-out-alt w-6 text-center mr-2"></i>退出登录
        </a>
      </div>
    </div>
  </nav>
  
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6">系统配置</h2>
      
      <form id="configForm" class="space-y-8">
        <div class="border-b border-gray-200 pb-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">管理员账户</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label for="adminUsername" class="block text-sm font-medium text-gray-700">用户名</label>
              <input type="text" id="adminUsername" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
            <div>
              <label for="adminPassword" class="block text-sm font-medium text-gray-700">密码</label>
              <input type="password" id="adminPassword" placeholder="如不修改密码，请留空" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              <p class="mt-1 text-sm text-gray-500">留空表示不修改当前密码</p>
            </div>
          </div>
        </div>
        
        <div class="border-b border-gray-200 pb-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">显示设置</h3>
          
          <div class="mb-6">
            <label for="themeModeSelect" class="block text-sm font-medium text-gray-700 mb-1">主题模式</label>
            <select id="themeModeSelect" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white sm:text-sm">
              <option value="light">🌞 浅色模式</option>
              <option value="dark">🌙 暗黑模式</option>
              <option value="system">🖥️ 跟随系统</option>
            </select>
            <p class="mt-1 text-sm text-gray-500">选择系统的外观风格</p>
          </div>
          
          <div class="mb-6">
            <label class="inline-flex items-center">
              <input type="checkbox" id="showLunarGlobal" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" checked>
              <span class="ml-2 text-sm text-gray-700">在通知中显示农历日期</span>
            </label>
            <p class="mt-1 text-sm text-gray-500">控制是否在通知消息中包含农历日期信息</p>
          </div>
        </div>

        <div class="border-b border-gray-200 pb-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">时区设置</h3>
          <div class="mb-6">
            <label for="timezone" class="block text-sm font-medium text-gray-700 mb-1">时区选择</label>
            <select id="timezone" name="timezone" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white">
              <option value="UTC">世界标准时间（UTC+0）</option>
              <option value="Asia/Shanghai">中国标准时间（UTC+8）</option>
              <option value="Asia/Hong_Kong">香港时间（UTC+8）</option>
              <option value="Asia/Taipei">台北时间（UTC+8）</option>
              <option value="Asia/Singapore">新加坡时间（UTC+8）</option>
              <option value="Asia/Tokyo">日本时间（UTC+9）</option>
              <option value="Asia/Seoul">韩国时间（UTC+9）</option>
              <option value="America/New_York">美国东部时间（UTC-5）</option>
              <option value="America/Chicago">美国中部时间（UTC-6）</option>
              <option value="America/Denver">美国山地时间（UTC-7）</option>
              <option value="America/Los_Angeles">美国太平洋时间（UTC-8）</option>
              <option value="Europe/London">英国时间（UTC+0）</option>
              <option value="Europe/Paris">巴黎时间（UTC+1）</option>
              <option value="Europe/Berlin">柏林时间（UTC+1）</option>
              <option value="Europe/Moscow">莫斯科时间（UTC+3）</option>
              <option value="Australia/Sydney">悉尼时间（UTC+10）</option>
              <option value="Australia/Melbourne">墨尔本时间（UTC+10）</option>
              <option value="Pacific/Auckland">奥克兰时间（UTC+12）</option>
            </select>
            <p class="mt-1 text-sm text-gray-500">选择需要使用时区，系统会按该时区计算剩余时间</p>
          </div>
        </div>

        <div class="border-b border-gray-200 pb-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">通知设置</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label for="notificationHours" class="block text-sm font-medium text-gray-700">通知时段（UTC）</label>
              <input type="text" id="notificationHours" placeholder="例如：08, 12, 20 或输入 * 表示全天"
                class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              <p class="mt-1 text-sm text-gray-500">可输入多个小时，使用逗号或空格分隔；留空则默认每小时均可发送</p>
            </div>
            <div class="bg-indigo-50 border border-indigo-100 rounded-md p-3 text-sm text-indigo-700">
              <p class="font-medium mb-1">提示</p>
              <p>Cloudflare Workers Cron 以 UTC 计算，例如北京时间 08:00 需设置 Cron 为 <code>0 0 * * *</code> 并在此填入 08。</p>
              <p class="mt-1">若 Cron 已设置为每小时执行，可用该字段限制实际发送提醒的小时段。</p>
            </div>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-3">通知方式（可多选）</label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="telegram" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <span class="ml-2 text-sm text-gray-700">Telegram</span>
              </label>
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="notifyx" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" checked>
                <span class="ml-2 text-sm text-gray-700 font-semibold">NotifyX</span>
              </label>
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="webhook" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <span class="ml-2 text-sm text-gray-700">Webhook 通知</span>
              </label>
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="wechatbot" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <span class="ml-2 text-sm text-gray-700">企业微信机器人</span>
              </label>
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="email" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <span class="ml-2 text-sm text-gray-700">邮件通知</span>
              </label>
              <label class="inline-flex items-center">
                <input type="checkbox" name="enabledNotifiers" value="bark" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <span class="ml-2 text-sm text-gray-700">Bark</span>
              </label>
            </div>
            <div class="mt-2 flex flex-wrap gap-4">
              <a href="https://www.notifyx.cn/" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">
                <i class="fas fa-external-link-alt ml-1"></i> NotifyX官网
              </a>
              <a href="https://webhook.site" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">
                <i class="fas fa-external-link-alt ml-1"></i> Webhook 调试工具
              </a>
              <a href="https://developer.work.weixin.qq.com/document/path/91770" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">
                <i class="fas fa-external-link-alt ml-1"></i> 企业微信机器人文档
              </a>
              <a href="https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">
                <i class="fas fa-external-link-alt ml-1"></i> 获取 Resend API Key
              </a>
              <a href="https://apps.apple.com/cn/app/bark-customed-notifications/id1403753865" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">
                <i class="fas fa-external-link-alt ml-1"></i> Bark iOS应用
              </a>
            </div>
          </div>

          <div class="mb-6">
            <label for="thirdPartyToken" class="block text-sm font-medium text-gray-700">第三方 API 访问令牌</label>
            <div class="mt-1 flex flex-col sm:flex-row sm:items-center gap-3">
              <input type="text" id="thirdPartyToken" placeholder="建议使用随机字符串，例如：iH5s9vB3..."
                class="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              <button type="button" id="generateThirdPartyToken" class="btn-info text-white px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap">
                <i class="fas fa-magic mr-2"></i>生成令牌
              </button>
            </div>
            <p class="mt-1 text-sm text-gray-500">调用 /api/notify/{token} 接口时需携带此令牌；留空表示禁用第三方 API 推送。</p>
          </div>
          
          <div id="telegramConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">Telegram 配置</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="tgBotToken" class="block text-sm font-medium text-gray-700">Bot Token</label>
                <input type="text" id="tgBotToken" placeholder="从 @BotFather 获取" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              </div>
              <div>
                <label for="tgChatId" class="block text-sm font-medium text-gray-700">Chat ID</label>
                <input type="text" id="tgChatId" placeholder="可从 @userinfobot 获取" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              </div>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testTelegramBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 Telegram 通知
              </button>
            </div>
          </div>
          
          <div id="notifyxConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">NotifyX 配置</h4>
            <div class="mb-4">
              <label for="notifyxApiKey" class="block text-sm font-medium text-gray-700">API Key</label>
              <input type="text" id="notifyxApiKey" placeholder="从 NotifyX 平台获取的 API Key" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              <p class="mt-1 text-sm text-gray-500">从 <a href="https://www.notifyx.cn/" target="_blank" class="text-indigo-600 hover:text-indigo-800">NotifyX平台</a> 获取的 API Key</p>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testNotifyXBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 NotifyX 通知
              </button>
            </div>
          </div>

          <div id="webhookConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">Webhook 通知 配置</h4>
            <div class="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label for="webhookUrl" class="block text-sm font-medium text-gray-700">Webhook 通知 URL</label>
                <input type="url" id="webhookUrl" placeholder="https://your-webhook-endpoint.com/path" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">请填写自建服务或第三方平台提供的 Webhook 地址</p>
              </div>
              <div>
                <label for="webhookMethod" class="block text-sm font-medium text-gray-700">请求方法</label>
                <select id="webhookMethod" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label for="webhookHeaders" class="block text-sm font-medium text-gray-700">自定义请求头 (JSON格式，可选)</label>
                <textarea id="webhookHeaders" rows="3" placeholder='{"Authorization": "Bearer your-token", "Content-Type": "application/json"}' class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
                <p class="mt-1 text-sm text-gray-500">JSON格式的自定义请求头，留空使用默认</p>
              </div>
              <div>
                <label for="webhookTemplate" class="block text-sm font-medium text-gray-700">消息模板 (JSON格式，可选)</label>
                <textarea id="webhookTemplate" rows="4" placeholder='{"title": "{{title}}", "content": "{{content}}", "timestamp": "{{timestamp}}"}' class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
                <p class="mt-1 text-sm text-gray-500">支持变量: {{title}}, {{content}}, {{timestamp}}。留空使用默认格式</p>
              </div>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testWebhookBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 Webhook 通知
              </button>
            </div>
          </div>

          <div id="wechatbotConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">企业微信机器人 配置</h4>
            <div class="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label for="wechatbotWebhook" class="block text-sm font-medium text-gray-700">机器人 Webhook URL</label>
                <input type="url" id="wechatbotWebhook" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your-key" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">从企业微信群聊中添加机器人获取的 Webhook URL</p>
              </div>
              <div>
                <label for="wechatbotMsgType" class="block text-sm font-medium text-gray-700">消息类型</label>
                <select id="wechatbotMsgType" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                  <option value="text">文本消息</option>
                  <option value="markdown">Markdown消息</option>
                </select>
                <p class="mt-1 text-sm text-gray-500">选择发送的消息格式类型</p>
              </div>
              <div>
                <label for="wechatbotAtMobiles" class="block text-sm font-medium text-gray-700">@手机号 (可选)</label>
                <input type="text" id="wechatbotAtMobiles" placeholder="13800138000,13900139000" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">需要@的手机号，多个用逗号分隔，留空则不@任何人</p>
              </div>
              <div>
                <label for="wechatbotAtAll" class="block text-sm font-medium text-gray-700 mb-2">@所有人</label>
                <label class="inline-flex items-center">
                  <input type="checkbox" id="wechatbotAtAll" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                  <span class="ml-2 text-sm text-gray-700">发送消息时@所有人</span>
                </label>
              </div>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testWechatBotBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 企业微信机器人
              </button>
            </div>
          </div>

          <div id="emailConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">邮件通知 配置</h4>
            <div class="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label for="resendApiKey" class="block text-sm font-medium text-gray-700">Resend API Key</label>
                <input type="text" id="resendApiKey" placeholder="re_xxxxxxxxxx" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">从 <a href="https://resend.com/api-keys" target="_blank" class="text-indigo-600 hover:text-indigo-800">Resend控制台</a> 获取的 API Key</p>
              </div>
              <div>
                <label for="emailFrom" class="block text-sm font-medium text-gray-700">发件人邮箱</label>
                <input type="email" id="emailFrom" placeholder="noreply@yourdomain.com" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">必须是已在Resend验证的域名邮箱</p>
              </div>
              <div>
                <label for="emailFromName" class="block text-sm font-medium text-gray-700">发件人名称</label>
                <input type="text" id="emailFromName" placeholder="订阅提醒系统" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">显示在邮件中的发件人名称</p>
              </div>
              <div>
                <label for="emailTo" class="block text-sm font-medium text-gray-700">收件人邮箱</label>
                <input type="email" id="emailTo" placeholder="user@example.com" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">接收通知邮件的邮箱地址</p>
              </div>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testEmailBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 邮件通知
              </button>
            </div>
          </div>

          <div id="barkConfig" class="config-section">
            <h4 class="text-md font-medium text-gray-900 mb-3">Bark 配置</h4>
            <div class="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label for="barkServer" class="block text-sm font-medium text-gray-700">服务器地址</label>
                <input type="url" id="barkServer" placeholder="https://api.day.app" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">Bark 服务器地址，默认为官方服务器，也可以使用自建服务器</p>
              </div>
              <div>
                <label for="barkDeviceKey" class="block text-sm font-medium text-gray-700">设备Key</label>
                <input type="text" id="barkDeviceKey" placeholder="从Bark应用获取的设备Key" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <p class="mt-1 text-sm text-gray-500">从 <a href="https://apps.apple.com/cn/app/bark-customed-notifications/id1403753865" target="_blank" class="text-indigo-600 hover:text-indigo-800">Bark iOS 应用</a> 中获取的设备Key</p>
              </div>
              <div>
                <label for="barkIsArchive" class="block text-sm font-medium text-gray-700 mb-2">保存推送</label>
                <label class="inline-flex items-center">
                  <input type="checkbox" id="barkIsArchive" class="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                  <span class="ml-2 text-sm text-gray-700">保存推送到历史记录</span>
                </label>
                <p class="mt-1 text-sm text-gray-500">勾选后推送消息会保存到 Bark 的历史记录中</p>
              </div>
            </div>
            <div class="flex justify-end">
              <button type="button" id="testBarkBtn" class="btn-secondary text-white px-4 py-2 rounded-md text-sm font-medium">
                <i class="fas fa-paper-plane mr-2"></i>测试 Bark 通知
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button type="submit" class="btn-primary text-white px-6 py-2 rounded-md text-sm font-medium">
            <i class="fas fa-save mr-2"></i>保存配置
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    function showToast(message, type = 'success', duration = 3000) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      
      const icon = type === 'success' ? 'check-circle' :
                   type === 'error' ? 'exclamation-circle' :
                   type === 'warning' ? 'exclamation-triangle' : 'info-circle';
      
      toast.innerHTML = '<div class="flex items-center"><i class="fas fa-' + icon + ' mr-2"></i><span>' + message + '</span></div>';
      
      container.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 100);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          if (container.contains(toast)) container.removeChild(toast);
        }, 300);
      }, duration);
    }

    async function loadConfig() {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();

        document.getElementById('adminUsername').value = config.ADMIN_USERNAME || '';
        document.getElementById('themeModeSelect').value = config.THEME_MODE || 'system';
        document.getElementById('tgBotToken').value = config.TG_BOT_TOKEN || '';
        document.getElementById('tgChatId').value = config.TG_CHAT_ID || '';
        document.getElementById('notifyxApiKey').value = config.NOTIFYX_API_KEY || '';
        document.getElementById('webhookUrl').value = config.WEBHOOK_URL || '';
        document.getElementById('webhookMethod').value = config.WEBHOOK_METHOD || 'POST';
        document.getElementById('webhookHeaders').value = config.WEBHOOK_HEADERS || '';
        document.getElementById('webhookTemplate').value = config.WEBHOOK_TEMPLATE || '';
        document.getElementById('wechatbotWebhook').value = config.WECHATBOT_WEBHOOK || '';
        document.getElementById('wechatbotMsgType').value = config.WECHATBOT_MSG_TYPE || 'text';
        document.getElementById('wechatbotAtMobiles').value = config.WECHATBOT_AT_MOBILES || '';
        document.getElementById('wechatbotAtAll').checked = config.WECHATBOT_AT_ALL === 'true';
        document.getElementById('resendApiKey').value = config.RESEND_API_KEY || '';
        document.getElementById('emailFrom').value = config.EMAIL_FROM || '';
        document.getElementById('emailFromName').value = config.EMAIL_FROM_NAME || '订阅提醒系统';
        document.getElementById('emailTo').value = config.EMAIL_TO || '';
        document.getElementById('barkServer').value = config.BARK_SERVER || 'https://api.day.app';
        document.getElementById('barkDeviceKey').value = config.BARK_DEVICE_KEY || '';
        document.getElementById('barkIsArchive').checked = config.BARK_IS_ARCHIVE === 'true';
        document.getElementById('thirdPartyToken').value = config.THIRD_PARTY_API_TOKEN || '';
        
        const notificationHoursInput = document.getElementById('notificationHours');
        if (notificationHoursInput) {
          const hours = Array.isArray(config.NOTIFICATION_HOURS) ? config.NOTIFICATION_HOURS : [];
          notificationHoursInput.value = hours.join(', ');
        }
        
        document.getElementById('showLunarGlobal').checked = config.SHOW_LUNAR === true;

        generateTimezoneOptions(config.TIMEZONE || 'UTC');

        const enabledNotifiers = config.ENABLED_NOTIFIERS || ['notifyx'];
        document.querySelectorAll('input[name="enabledNotifiers"]').forEach(checkbox => {
          checkbox.checked = enabledNotifiers.includes(checkbox.value);
        });

        toggleNotificationConfigs(enabledNotifiers);
      } catch (error) {
        console.error('加载配置失败:', error);
        showToast('加载配置失败，请刷新页面重试', 'error');
      }
    }
    
    function generateTimezoneOptions(selectedTimezone = 'UTC') {
      const timezoneSelect = document.getElementById('timezone');
      
      const timezones = [
        { value: 'UTC', name: '世界标准时间', offset: '+0' },
        { value: 'Asia/Shanghai', name: '中国标准时间', offset: '+8' },
        { value: 'Asia/Hong_Kong', name: '香港时间', offset: '+8' },
        { value: 'Asia/Taipei', name: '台北时间', offset: '+8' },
        { value: 'Asia/Singapore', name: '新加坡时间', offset: '+8' },
        { value: 'Asia/Tokyo', name: '日本时间', offset: '+9' },
        { value: 'Asia/Seoul', name: '韩国时间', offset: '+9' },
        { value: 'America/New_York', name: '美国东部时间', offset: '-5' },
        { value: 'America/Chicago', name: '美国中部时间', offset: '-6' },
        { value: 'America/Denver', name: '美国山地时间', offset: '-7' },
        { value: 'America/Los_Angeles', name: '美国太平洋时间', offset: '-8' },
        { value: 'Europe/London', name: '英国时间', offset: '+0' },
        { value: 'Europe/Paris', name: '巴黎时间', offset: '+1' },
        { value: 'Europe/Berlin', name: '柏林时间', offset: '+1' },
        { value: 'Europe/Moscow', name: '莫斯科时间', offset: '+3' },
        { value: 'Australia/Sydney', name: '悉尼时间', offset: '+10' },
        { value: 'Australia/Melbourne', name: '墨尔本时间', offset: '+10' },
        { value: 'Pacific/Auckland', name: '奥克兰时间', offset: '+12' }
      ];
      
      timezoneSelect.innerHTML = '';
      
      timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz.value;
        option.textContent = tz.name + '（UTC' + tz.offset + '）';
        timezoneSelect.appendChild(option);
      });
      
      timezoneSelect.value = selectedTimezone;
    }
    
    function toggleNotificationConfigs(enabledNotifiers) {
      const telegramConfig = document.getElementById('telegramConfig');
      const notifyxConfig = document.getElementById('notifyxConfig');
      const webhookConfig = document.getElementById('webhookConfig');
      const wechatbotConfig = document.getElementById('wechatbotConfig');
      const emailConfig = document.getElementById('emailConfig');
      const barkConfig = document.getElementById('barkConfig');

      [telegramConfig, notifyxConfig, webhookConfig, wechatbotConfig, emailConfig, barkConfig].forEach(config => {
        config.classList.remove('active', 'inactive');
        config.classList.add('inactive');
      });

      enabledNotifiers.forEach(type => {
        if (type === 'telegram') {
          telegramConfig.classList.remove('inactive');
          telegramConfig.classList.add('active');
        } else if (type === 'notifyx') {
          notifyxConfig.classList.remove('inactive');
          notifyxConfig.classList.add('active');
        } else if (type === 'webhook') {
          webhookConfig.classList.remove('inactive');
          webhookConfig.classList.add('active');
        } else if (type === 'wechatbot') {
          wechatbotConfig.classList.remove('inactive');
          wechatbotConfig.classList.add('active');
        } else if (type === 'email') {
          emailConfig.classList.remove('inactive');
          emailConfig.classList.add('active');
        } else if (type === 'bark') {
          barkConfig.classList.remove('inactive');
          barkConfig.classList.add('active');
        }
      });
    }

    document.querySelectorAll('input[name="enabledNotifiers"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const enabledNotifiers = Array.from(document.querySelectorAll('input[name="enabledNotifiers"]:checked'))
          .map(cb => cb.value);
        toggleNotificationConfigs(enabledNotifiers);
      });
    });
    
    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const enabledNotifiers = Array.from(document.querySelectorAll('input[name="enabledNotifiers"]:checked'))
        .map(cb => cb.value);

      if (enabledNotifiers.length === 0) {
        showToast('请至少选择一种通知方式', 'warning');
        return;
      }

      const config = {
        ADMIN_USERNAME: document.getElementById('adminUsername').value.trim(),
        THEME_MODE: document.getElementById('themeModeSelect').value,
        TG_BOT_TOKEN: document.getElementById('tgBotToken').value.trim(),
        TG_CHAT_ID: document.getElementById('tgChatId').value.trim(),
        NOTIFYX_API_KEY: document.getElementById('notifyxApiKey').value.trim(),
        WEBHOOK_URL: document.getElementById('webhookUrl').value.trim(),
        WEBHOOK_METHOD: document.getElementById('webhookMethod').value,
        WEBHOOK_HEADERS: document.getElementById('webhookHeaders').value.trim(),
        WEBHOOK_TEMPLATE: document.getElementById('webhookTemplate').value.trim(),
        SHOW_LUNAR: document.getElementById('showLunarGlobal').checked,
        WECHATBOT_WEBHOOK: document.getElementById('wechatbotWebhook').value.trim(),
        WECHATBOT_MSG_TYPE: document.getElementById('wechatbotMsgType').value,
        WECHATBOT_AT_MOBILES: document.getElementById('wechatbotAtMobiles').value.trim(),
        WECHATBOT_AT_ALL: document.getElementById('wechatbotAtAll').checked.toString(),
        RESEND_API_KEY: document.getElementById('resendApiKey').value.trim(),
        EMAIL_FROM: document.getElementById('emailFrom').value.trim(),
        EMAIL_FROM_NAME: document.getElementById('emailFromName').value.trim(),
        EMAIL_TO: document.getElementById('emailTo').value.trim(),
        BARK_SERVER: document.getElementById('barkServer').value.trim() || 'https://api.day.app',
        BARK_DEVICE_KEY: document.getElementById('barkDeviceKey').value.trim(),
        BARK_IS_ARCHIVE: document.getElementById('barkIsArchive').checked.toString(),
        ENABLED_NOTIFIERS: enabledNotifiers,
        TIMEZONE: document.getElementById('timezone').value.trim(),
        THIRD_PARTY_API_TOKEN: document.getElementById('thirdPartyToken').value.trim(),
        NOTIFICATION_HOURS: (() => {
          const raw = document.getElementById('notificationHours').value.trim();
          if (!raw) return [];
          return raw
            .split(/[,，\s]+/)
            .map(item => item.trim())
            .filter(item => item.length > 0);
        })()
      };

      const passwordField = document.getElementById('adminPassword');
      if (passwordField.value.trim()) {
        config.ADMIN_PASSWORD = passwordField.value.trim();
      }

      const submitButton = e.target.querySelector('button[type="submit"]');
      const originalContent = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
      submitButton.disabled = true;

      try {
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
          showToast('配置保存成功', 'success');
          if (window.updateAppTheme) {
            window.updateAppTheme(config.THEME_MODE);
          }
          passwordField.value = '';
          
          localStorage.setItem('timezoneUpdated', Date.now().toString());
          
          if (window.location.pathname === '/admin') {
            window.location.reload();
          }
        } else {
          showToast('配置保存失败: ' + (result.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error('保存配置失败:', error);
        showToast('保存配置失败，请稍后再试', 'error');
      } finally {
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
      }
    });
    
    async function testNotification(type) {
      const buttonId = type === 'telegram' ? 'testTelegramBtn' :
                      type === 'notifyx' ? 'testNotifyXBtn' :
                      type === 'wechatbot' ? 'testWechatBotBtn' :
                      type === 'email' ? 'testEmailBtn' :
                      type === 'bark' ? 'testBarkBtn' : 'testWebhookBtn';
      const button = document.getElementById(buttonId);
      const originalContent = button.innerHTML;
      const serviceName = type === 'telegram' ? 'Telegram' :
                          type === 'notifyx' ? 'NotifyX' :
                          type === 'wechatbot' ? '企业微信机器人' :
                          type === 'email' ? '邮件通知' :
                          type === 'bark' ? 'Bark' : 'Webhook 通知';

      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>测试中...';
      button.disabled = true;

      const config = {};
      if (type === 'telegram') {
        config.TG_BOT_TOKEN = document.getElementById('tgBotToken').value.trim();
        config.TG_CHAT_ID = document.getElementById('tgChatId').value.trim();

        if (!config.TG_BOT_TOKEN || !config.TG_CHAT_ID) {
          showToast('请先填写 Telegram Bot Token 和 Chat ID', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      } else if (type === 'notifyx') {
        config.NOTIFYX_API_KEY = document.getElementById('notifyxApiKey').value.trim();

        if (!config.NOTIFYX_API_KEY) {
          showToast('请先填写 NotifyX API Key', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      } else if (type === 'webhook') {
        config.WEBHOOK_URL = document.getElementById('webhookUrl').value.trim();
        config.WEBHOOK_METHOD = document.getElementById('webhookMethod').value;
        config.WEBHOOK_HEADERS = document.getElementById('webhookHeaders').value.trim();
        config.WEBHOOK_TEMPLATE = document.getElementById('webhookTemplate').value.trim();

        if (!config.WEBHOOK_URL) {
          showToast('请先填写 Webhook 通知 URL', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      } else if (type === 'wechatbot') {
        config.WECHATBOT_WEBHOOK = document.getElementById('wechatbotWebhook').value.trim();
        config.WECHATBOT_MSG_TYPE = document.getElementById('wechatbotMsgType').value;
        config.WECHATBOT_AT_MOBILES = document.getElementById('wechatbotAtMobiles').value.trim();
        config.WECHATBOT_AT_ALL = document.getElementById('wechatbotAtAll').checked.toString();

        if (!config.WECHATBOT_WEBHOOK) {
          showToast('请先填写企业微信机器人 Webhook URL', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      } else if (type === 'email') {
        config.RESEND_API_KEY = document.getElementById('resendApiKey').value.trim();
        config.EMAIL_FROM = document.getElementById('emailFrom').value.trim();
        config.EMAIL_FROM_NAME = document.getElementById('emailFromName').value.trim();
        config.EMAIL_TO = document.getElementById('emailTo').value.trim();

        if (!config.RESEND_API_KEY || !config.EMAIL_FROM || !config.EMAIL_TO) {
          showToast('请先填写 Resend API Key、发件人邮箱和收件人邮箱', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      } else if (type === 'bark') {
        config.BARK_SERVER = document.getElementById('barkServer').value.trim() || 'https://api.day.app';
        config.BARK_DEVICE_KEY = document.getElementById('barkDeviceKey').value.trim();
        config.BARK_IS_ARCHIVE = document.getElementById('barkIsArchive').checked.toString();

        if (!config.BARK_DEVICE_KEY) {
          showToast('请先填写 Bark 设备Key', 'warning');
          button.innerHTML = originalContent;
          button.disabled = false;
          return;
        }
      }

      try {
        const response = await fetch('/api/test-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: type, ...config })
        });

        const result = await response.json();

        if (result.success) {
          showToast(serviceName + ' 通知测试成功！', 'success');
        } else {
          showToast(serviceName + ' 通知测试失败: ' + (result.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error('测试通知失败:', error);
        showToast('测试失败，请稍后再试', 'error');
      } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
      }
    }
    
    document.getElementById('testTelegramBtn').addEventListener('click', () => testNotification('telegram'));
    document.getElementById('testNotifyXBtn').addEventListener('click', () => testNotification('notifyx'));
    document.getElementById('testWebhookBtn').addEventListener('click', () => testNotification('webhook'));
    document.getElementById('testWechatBotBtn').addEventListener('click', () => testNotification('wechatbot'));
    document.getElementById('testEmailBtn').addEventListener('click', () => testNotification('email'));
    document.getElementById('testBarkBtn').addEventListener('click', () => testNotification('bark'));

    document.getElementById('generateThirdPartyToken').addEventListener('click', () => {
      try {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const buffer = new Uint8Array(32);
        window.crypto.getRandomValues(buffer);
        const token = Array.from(buffer).map(v => charset[v % charset.length]).join('');
        const input = document.getElementById('thirdPartyToken');
        input.value = token;
        input.dispatchEvent(new Event('input'));
        showToast('已生成新的第三方 API 令牌，请保存配置后生效', 'info');
      } catch (error) {
        console.error('生成令牌失败:', error);
        showToast('生成令牌失败，请手动输入', 'error');
      }
    });

    let globalTimezone = 'UTC';
    
    async function showSystemTime() {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        globalTimezone = config.TIMEZONE || 'UTC';
        
        function formatTime(dt, tz) {
          return dt.toLocaleString('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        function formatTimezoneDisplay(tz) {
          try {
            const now = new Date();
            const dtf = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour12: false,
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const parts = dtf.formatToParts(now);
            const get = type => Number(parts.find(x => x.type === type).value);
            const target = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
            const utc = now.getTime();
            const offset = Math.round((target - utc) / (1000 * 60 * 60));
            
            const timezoneNames = {
              'UTC': '世界标准时间',
              'Asia/Shanghai': '中国标准时间',
              'Asia/Hong_Kong': '香港时间',
              'Asia/Taipei': '台北时间',
              'Asia/Singapore': '新加坡时间',
              'Asia/Tokyo': '日本时间',
              'Asia/Seoul': '韩国时间',
              'America/New_York': '美国东部时间',
              'America/Los_Angeles': '美国太平洋时间',
              'America/Chicago': '美国中部时间',
              'America/Denver': '美国山地时间',
              'Europe/London': '英国时间',
              'Europe/Paris': '巴黎时间',
              'Europe/Berlin': '柏林时间',
              'Europe/Moscow': '莫斯科时间',
              'Australia/Sydney': '悉尼时间',
              'Australia/Melbourne': '墨尔本时间',
              'Pacific/Auckland': '奥克兰时间'
            };
            
            const offsetStr = offset >= 0 ? '+' + offset : offset;
            const timezoneName = timezoneNames[tz] || tz;
            return timezoneName + ' (UTC' + offsetStr + ')';
          } catch (error) {
            console.error('格式化时区显示失败:', error);
            return tz;
          }
        }
        function update() {
          const now = new Date();
          const timeStr = formatTime(now, globalTimezone);
          const tzStr = formatTimezoneDisplay(globalTimezone);
          const el = document.getElementById('systemTimeDisplay');
          if (el) el.textContent = timeStr + '  ' + tzStr;
          const mobileEl = document.getElementById('mobileTimeDisplay');
          if (mobileEl) mobileEl.textContent = timeStr + ' ' + tzStr;
        }
        update();
        setInterval(update, 1000);
      } catch (e) {
        console.error(e);
      }
    }

    window.addEventListener('load', loadConfig);
    showSystemTime();

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        const icon = mobileMenuBtn.querySelector('i');
        if (mobileMenu.classList.contains('hidden')) {
          icon.classList.remove('fa-times');
          icon.classList.add('fa-bars');
        } else {
          icon.classList.remove('fa-bars');
          icon.classList.add('fa-times');
        }
      });
      
      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
        });
      });
    }
  </script>
</body>
</html>`;

function dashboardPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>仪表盘 - SubsTracker</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  ${themeResources}
  <style>
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: all 0.3s; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
    .stat-card{background:white;border-radius:12px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:transform 0.2s,box-shadow 0.2s}
    .stat-card:hover{transform:translateY(-4px);box-shadow:0 4px 16px rgba(0,0,0,0.15)}
    .stat-card-header{color:#6b7280;font-size:0.875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem}
    .stat-card-value{font-size:2rem;font-weight:700;color:#1f2937;margin-bottom:0.25rem}
    .stat-card-subtitle{color:#9ca3af;font-size:0.875rem}
    .stat-card-trend{display:inline-flex;align-items:center;gap:0.25rem;font-size:0.875rem;margin-top:0.5rem;padding:0.25rem 0.5rem;border-radius:6px}
    .stat-card-trend.up{color:#10b981;background:#d1fae5}
    .stat-card-trend.down{color:#ef4444;background:#fee2e2}
    .stat-card-trend.flat{color:#6b7280;background:#f3f4f6}
    .list-item{display:flex;align-items:center;justify-content:space-between;padding:1rem;border-radius:8px;transition:background 0.2s}
    .list-item:hover{background:#f9fafb}
    .list-item:not(:last-child){border-bottom:1px solid #f3f4f6}
    .list-item-content{flex:1}
    .list-item-name{font-weight:600;color:#1f2937;margin-bottom:0.25rem}
    .list-item-meta{display:flex;align-items:center;gap:1rem;font-size:0.875rem;color:#6b7280;flex-wrap:wrap}
    .list-item-amount{font-size:1.125rem;font-weight:700;color:#10b981}
    .list-item-badge{display:inline-block;padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:500;background:#e0e7ff;color:#4f46e5}
    .ranking-item{margin-bottom:1rem}
    .ranking-item-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem}
    .ranking-item-name{font-weight:600;color:#1f2937}
    .ranking-item-value{display:flex;align-items:center;gap:0.5rem;font-size:0.875rem}
    .ranking-item-amount{font-weight:700;color:#1f2937}
    .ranking-item-percentage{color:#10b981}
    .ranking-progress{width:100%;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden}
    .ranking-progress-bar{height:100%;border-radius:4px;transition:width 0.6s ease}
    .ranking-progress-bar.color-1{background:linear-gradient(90deg,#6366f1,#8b5cf6)}
    .ranking-progress-bar.color-2{background:linear-gradient(90deg,#10b981,#059669)}
    .ranking-progress-bar.color-3{background:linear-gradient(90deg,#f59e0b,#d97706)}
    .ranking-progress-bar.color-4{background:linear-gradient(90deg,#ef4444,#dc2626)}
    .ranking-progress-bar.color-5{background:linear-gradient(90deg,#8b5cf6,#7c3aed)}
    .empty-state{text-align:center;padding:3rem 1rem;color:#9ca3af}
    .empty-state-icon{font-size:3rem;margin-bottom:1rem;opacity:0.5}
    .empty-state-text{font-size:0.875rem}
    html.dark .stat-card { background: #1f2937; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); }
    html.dark .stat-card-header { color: #9ca3af; }
    html.dark .stat-card-value { color: #f3f4f6; }
    html.dark .stat-card-subtitle { color: #6b7280; } 
    html.dark .stat-card-trend.flat { background: #374151; color: #9ca3af; }
    html.dark .stat-card-trend.up { background: rgba(16, 185, 129, 0.2); }
    html.dark .stat-card-trend.down { background: rgba(239, 68, 68, 0.2); }
    html.dark .list-item:hover { background: #374151; }
    html.dark .list-item:not(:last-child) { border-bottom-color: #374151; }
    html.dark .list-item-name { color: #f3f4f6; }
    html.dark .list-item-meta { color: #9ca3af; }
    html.dark .list-item-badge { background: #3730a3; color: #c7d2fe; }
    html.dark .ranking-item-name { color: #f3f4f6; }
    html.dark .ranking-item-amount { color: #e5e7eb; }
    html.dark .ranking-progress { background: #374151; }
    html.dark .bg-indigo-100 { background-color: rgba(99, 102, 241, 0.2) !important; color: #a5b4fc !important; }
    html.dark .text-indigo-800 { color: #c7d2fe !important; }
    .loading-skeleton{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200% 100%;animation:loading 1.5s infinite;height:100px;border-radius:8px}
    html.dark .loading-skeleton { background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%); }
    @keyframes loading{0%{background-position:200% 0}100%{background-position:-200% 0}}
  </style>
</head>
<body class="bg-gray-50">
  <nav class="bg-white shadow-md relative z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center shrink-0">
          <div class="flex items-center">
            <i class="fas fa-calendar-check text-indigo-600 text-2xl mr-2"></i>
            <span class="font-bold text-xl text-gray-800">订阅管理系统</span>
          </div>
          <span id="systemTimeDisplay" class="ml-4 text-base text-indigo-600 font-normal hidden md:block pt-1"></span>
        </div>
        
        <div class="hidden md:flex items-center space-x-4 ml-auto">
          <a href="/admin/dashboard" class="text-indigo-600 border-b-2 border-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-chart-line mr-1"></i>仪表盘
          </a>
          <a href="/admin" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-list mr-1"></i>订阅列表
          </a>
          <a href="/admin/config" class="text-gray-700 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-cog mr-1"></i>系统配置
          </a>
          <a href="/api/logout" class="text-gray-700 hover:text-red-600 border-b-2 border-transparent hover:border-red-300 px-3 py-2 rounded-md text-sm font-medium transition">
            <i class="fas fa-sign-out-alt mr-1"></i>退出登录
          </a>
        </div>

        <div class="flex items-center md:hidden ml-auto">
          <button id="mobile-menu-btn" type="button" class="text-gray-600 hover:text-indigo-600 focus:outline-none p-2 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <i class="fas fa-bars text-xl"></i>
          </button>
        </div>
      </div>
    </div>

    <div id="mobile-menu" class="hidden md:hidden bg-white border-t border-b border-gray-200 w-full">
      <div class="px-4 pt-2 pb-4 space-y-2">
        <div id="mobileTimeDisplay" class="px-3 py-2 text-xs text-indigo-600 text-right border-b border-gray-100 mb-2"></div>
        <a href="/admin/dashboard" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-chart-line w-6 text-center mr-2"></i>仪表盘
        </a>
        <a href="/admin" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-list w-6 text-center mr-2"></i>订阅列表
        </a>
        <a href="/admin/config" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 active:bg-indigo-100 transition-colors">
          <i class="fas fa-cog w-6 text-center mr-2"></i>系统配置
        </a>
        <a href="/api/logout" class="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 active:bg-red-100 transition-colors">
          <i class="fas fa-sign-out-alt w-6 text-center mr-2"></i>退出登录
        </a>
      </div>
    </div>
  </nav>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-gray-800">📊 仪表板</h2>
      <p class="text-sm text-gray-500 mt-1">订阅费用和活动概览（统计金额已折合为 CNY）</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" id="statsGrid">
      <div class="loading-skeleton"></div>
      <div class="loading-skeleton"></div>
      <div class="loading-skeleton"></div>
    </div>

    <div class="bg-white rounded-lg shadow-md overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-calendar-check text-blue-500"></i>
          <h3 class="text-lg font-medium text-gray-900">最近支付</h3>
        </div>
        <span class="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">过去7天</span>
      </div>
      <div class="p-6" id="recentPayments">
        <div class="loading-skeleton"></div>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-md overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-clock text-yellow-500"></i>
          <h3 class="text-lg font-medium text-gray-900">即将续费</h3>
        </div>
        <span class="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">未来7天</span>
      </div>
      <div class="p-6" id="upcomingRenewals">
        <div class="loading-skeleton"></div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fas fa-chart-bar text-purple-500"></i>
            <h3 class="text-lg font-medium text-gray-900">按类型支出排行</h3>
          </div>
          <span class="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">年度统计 (折合CNY)</span>
        </div>
        <div class="p-6" id="expenseByType">
          <div class="loading-skeleton"></div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fas fa-folder text-green-500"></i>
            <h3 class="text-lg font-medium text-gray-900">按分类支出统计</h3>
          </div>
          <span class="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">年度统计 (折合CNY)</span>
        </div>
        <div class="p-6" id="expenseByCategory">
          <div class="loading-skeleton"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const currencySymbols = {
      'CNY': '¥', 'USD': '$', 'HKD': 'HK$', 'TWD': 'NT$', 
      'JPY': '¥', 'EUR': '€', 'GBP': '£', 'KRW': '₩', 'TRY': '₺'
    };
    function getSymbol(currency) { return currencySymbols[currency] || '¥'; }

    let globalTimezone = 'UTC';

    async function showSystemTime() {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        globalTimezone = config.TIMEZONE || 'UTC';
        
        function formatTime(dt, tz) {
          return dt.toLocaleString('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        function formatTimezoneDisplay(tz) {
          try {
            const now = new Date();
            const dtf = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour12: false,
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const parts = dtf.formatToParts(now);
            const get = type => Number(parts.find(x => x.type === type).value);
            const target = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
            const utc = now.getTime();
            const offset = Math.round((target - utc) / (1000 * 60 * 60));
            
            const timezoneNames = {
              'UTC': '世界标准时间',
              'Asia/Shanghai': '中国标准时间',
              'Asia/Hong_Kong': '香港时间',
              'Asia/Taipei': '台北时间',
              'Asia/Singapore': '新加坡时间',
              'Asia/Tokyo': '日本时间',
              'Asia/Seoul': '韩国时间',
              'America/New_York': '美国东部时间',
              'America/Los_Angeles': '美国太平洋时间',
              'America/Chicago': '美国中部时间',
              'America/Denver': '美国山地时间',
              'Europe/London': '英国时间',
              'Europe/Paris': '巴黎时间',
              'Europe/Berlin': '柏林时间',
              'Europe/Moscow': '莫斯科时间',
              'Australia/Sydney': '悉尼时间',
              'Australia/Melbourne': '墨尔本时间',
              'Pacific/Auckland': '奥克兰时间'
            };
            
            const offsetStr = offset >= 0 ? '+' + offset : offset;
            const timezoneName = timezoneNames[tz] || tz;
            return timezoneName + ' (UTC' + offsetStr + ')';
          } catch (error) {
            console.error('格式化时区显示失败:', error);
            return tz;
          }
        }
        function update() {
          const now = new Date();
          const timeStr = formatTime(now, globalTimezone);
          const tzStr = formatTimezoneDisplay(globalTimezone);
          const el = document.getElementById('systemTimeDisplay');
          if (el) el.textContent = timeStr + '  ' + tzStr;
          const mobileEl = document.getElementById('mobileTimeDisplay');
          if (mobileEl) mobileEl.textContent = timeStr + ' ' + tzStr;
        }
        update();
        setInterval(update, 1000);
      } catch (e) { console.error(e); }
    }

    async function loadDashboardData(){
      try {
        const r = await fetch('/api/dashboard/stats');
        const d = await r.json();
        if(!d.success) throw new Error(d.message||'加载失败');
        
        const data = d.data;
        document.getElementById('statsGrid').innerHTML = \`
          <div class="stat-card">
            <div class="stat-card-header">月度支出 (CNY)</div>
            <div class="stat-card-value">¥\${data.monthlyExpense.amount.toFixed(2)}</div>
            <div class="stat-card-subtitle">本月折合支出</div>
            <div class="stat-card-trend \${data.monthlyExpense.trendDirection}">
              <i class="fas fa-arrow-\${data.monthlyExpense.trendDirection==='up'?'up':data.monthlyExpense.trendDirection==='down'?'down':'right'}"></i>
              \${data.monthlyExpense.trend}%
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">年度支出 (CNY)</div>
            <div class="stat-card-value">¥\${data.yearlyExpense.amount.toFixed(2)}</div>
            <div class="stat-card-subtitle">月均支出: ¥\${data.yearlyExpense.monthlyAverage.toFixed(2)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-header">活跃订阅</div>
            <div class="stat-card-value">\${data.activeSubscriptions.active}</div>
            <div class="stat-card-subtitle">总订阅数: \${data.activeSubscriptions.total}</div>
            \${data.activeSubscriptions.expiringSoon>0?\`<div class="stat-card-trend down"><i class="fas fa-exclamation-circle"></i>\${data.activeSubscriptions.expiringSoon} 即将到期</div>\`:''}
          </div>
        \`;
        
        const rp = document.getElementById('recentPayments');
        rp.innerHTML = data.recentPayments.length===0?'<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">过去7天内没有支付记录</div></div>':
        data.recentPayments.map(s=>\`
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-name">\${s.name}</div>
              <div class="list-item-meta">
                <span><i class="fas fa-calendar"></i> \${new Date(s.paymentDate).toLocaleDateString('zh-CN')}</span>
                \${s.customType?\`<span class="list-item-badge">\${s.customType}</span>\`:''}
              </div>
            </div>
            <div class="list-item-amount">\${getSymbol(s.currency)}\${(s.amount||0).toFixed(2)}</div>
          </div>
        \`).join('');
        
        const ur = document.getElementById('upcomingRenewals');
        ur.innerHTML = data.upcomingRenewals.length===0?'<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">未来7天内没有即将续费的订阅</div></div>':
        data.upcomingRenewals.map(s=>\`
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-name">\${s.name}</div>
              <div class="list-item-meta">
                <span><i class="fas fa-clock"></i> \${new Date(s.renewalDate).toLocaleDateString('zh-CN')}</span>
                <span style="color:#f59e0b;font-weight:600">\${s.daysUntilRenewal} 天后</span>
                \${s.customType?\`<span class="list-item-badge">\${s.customType}</span>\`:''}
              </div>
            </div>
            <div class="list-item-amount">\${getSymbol(s.currency)}\${(s.amount||0).toFixed(2)}</div>
          </div>
        \`).join('');
        
        const et = document.getElementById('expenseByType');
        et.innerHTML = data.expenseByType.length===0?'<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无支出数据</div></div>':
        data.expenseByType.map((item,i)=>