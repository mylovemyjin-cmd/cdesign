// 알림 채널
// ─────────────────────────────────────────────────────────────
// 인시던트/조치 결과를 설정된 채널로 전달한다.
// 내장 채널: console, webhook, email, custom
//  - console : 로거로 출력
//  - webhook : JSON POST (Slack/Teams Incoming Webhook 등)
//  - email   : nodemailer(SMTP). 미설치/미설정 시 자동 생략
//  - custom  : config 에서 직접 정의한 deliver(payload, ctx) 함수
//              (이 앱에서는 in-app notifications 테이블 적재에 사용)

const { meetsMinSeverity } = require('./severity');

let nodemailerCache;
function loadNodemailer() {
  if (nodemailerCache !== undefined) return nodemailerCache;
  try {
    nodemailerCache = require('nodemailer');
  } catch {
    nodemailerCache = null; // 미설치 — email 채널 비활성
  }
  return nodemailerCache;
}

async function deliverConsole(channel, payload, ctx) {
  const line = `[OpsAgent][${payload.severity}] ${payload.title} — ${payload.message}`;
  if (payload.severity === 'critical') ctx.logger.error(line);
  else if (payload.severity === 'warning') ctx.logger.warn(line);
  else ctx.logger.info(line);
}

async function deliverWebhook(channel, payload, ctx) {
  const url = channel.url || process.env.OPS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${payload.severity.toUpperCase()}] ${payload.title}\n${payload.message}`,
        ...payload,
      }),
    });
  } catch (err) {
    ctx.logger.warn(`[OpsAgent] webhook 알림 실패: ${err.message}`);
  }
}

async function deliverEmail(channel, payload, ctx) {
  const nodemailer = loadNodemailer();
  if (!nodemailer || !process.env.SMTP_HOST) {
    ctx.logger.debug?.('[OpsAgent] email 채널 생략 (nodemailer/SMTP 미설정)');
    return;
  }
  const to = (channel.to || []).join(', ');
  if (!to) return;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_USER || 'ops-agent@localhost',
      to,
      subject: `[운영알림][${payload.severity}] ${payload.title}`,
      text: payload.message,
    });
  } catch (err) {
    ctx.logger.warn(`[OpsAgent] email 알림 실패: ${err.message}`);
  }
}

// 단일 알림 전달
async function notify(channels, payload, ctx) {
  for (const channel of channels) {
    const min = channel.minSeverity || 'info';
    if (!meetsMinSeverity(payload.severity, min)) continue;
    try {
      switch (channel.type) {
        case 'console':
          await deliverConsole(channel, payload, ctx);
          break;
        case 'webhook':
          await deliverWebhook(channel, payload, ctx);
          break;
        case 'email':
          await deliverEmail(channel, payload, ctx);
          break;
        case 'custom':
          if (typeof channel.deliver === 'function') await channel.deliver(payload, ctx);
          break;
        default:
          ctx.logger.warn(`[OpsAgent] 알 수 없는 채널 타입: ${channel.type}`);
      }
    } catch (err) {
      ctx.logger.warn(`[OpsAgent] 채널(${channel.type}) 알림 실패: ${err.message}`);
    }
  }
}

module.exports = { notify };
