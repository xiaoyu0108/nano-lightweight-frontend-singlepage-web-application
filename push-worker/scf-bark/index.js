// 腾讯云云函数 SCF —— 定时调用 Bark，给 iPhone 发系统推送（国内直连，无需梯子）
// 运行环境：Node.js 18；无需安装任何依赖
//
// 环境变量（在 SCF 控制台「函数配置 → 环境变量」里填）：
//   BARK_KEY     Bark App 首页复制的那串密钥（也可以填自建服务器完整地址，http 开头）
//   REMIND_TIMES 提醒时间，逗号分隔，24 小时制，必须是 5 分钟的整数倍，例如 "09:00,12:30,20:00,23:00"
//   REMIND_TEXT  可选，通知正文，默认「有人想你了，点开看看～」
//
// 定时触发器 Cron（秒 分 时 日 月 周 年）：0 */5 * * * * *
// 效果：到点后苹果把系统通知推到你 iPhone，App 关着也能收到。

const https = require('https');

exports.main_handler = async (event, context) => {
  const key = process.env.BARK_KEY || '';
  const times = (process.env.REMIND_TIMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const text = process.env.REMIND_TEXT || '有人想你了，点开看看～';
  if (!key) return '缺少 BARK_KEY';
  if (!times.length) return '缺少 REMIND_TIMES';

  // 换算成北京时间（UTC+8）
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const cur = String(now.getUTCHours()).padStart(2, '0') + ':' + String(now.getUTCMinutes()).padStart(2, '0');
  if (!times.includes(cur)) return '跳过 ' + cur;

  const base = key.indexOf('http') === 0 ? key.replace(/\/+$/, '') : ('https://api.day.app/' + encodeURIComponent(key));
  const url = base + '/' + encodeURIComponent('你有一条新消息') + '/' + encodeURIComponent(text) + '?group=Nano&level=active';

  await new Promise((resolve) => {
    https.get(url, (res) => { res.resume(); res.on('end', resolve); }).on('error', () => resolve());
  });
  return '已推送 ' + cur;
};
