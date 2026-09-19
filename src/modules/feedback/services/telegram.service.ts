import { injectable } from "inversify";
import axios from "axios";
import { env } from "../../../config/env.js";
import logger from "../../../shared/logger.js";

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface ParsedType {
  emoji: string;
  label: string;
}

function parseType(type: string): ParsedType {
  switch (type) {
    case "bug":
      return { emoji: "🐞", label: "Bug Report" };
    case "feature":
      return { emoji: "💡", label: "Feature Request" };
    case "general":
      return { emoji: "✨", label: "General / Praise" };
    default:
      return { emoji: "📝", label: type };
  }
}

interface ParsedDevice {
  device: string;
  icon: string;
  browser: string;
}

function parseUserAgent(ua: string, fallbackPlatform?: string): ParsedDevice {
  let device = "Unknown";
  let icon = "🖥️";
  let browser = "Unknown";

  if (!ua) {
    const dev = fallbackPlatform || "Unknown";
    const isMob = /iPhone|iPad|Android|Mobile/i.test(dev);
    return {
      device: dev,
      icon: isMob ? "📱" : "🖥️",
      browser: "Unknown",
    };
  }

  // Detect Device / OS
  if (/iPhone/i.test(ua)) {
    device = "iPhone";
    icon = "📱";
  } else if (/iPad/i.test(ua)) {
    device = "iPad";
    icon = "📱";
  } else if (/Android/i.test(ua)) {
    device = "Android";
    icon = "📱";
  } else if (/Windows/i.test(ua)) {
    device = "Windows";
    icon = "🖥️";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = "macOS";
    icon = "🖥️";
  } else if (/CrOS/i.test(ua)) {
    device = "ChromeOS";
    icon = "🖥️";
  } else if (/Linux/i.test(ua)) {
    device = "Linux";
    icon = "🖥️";
  } else if (fallbackPlatform) {
    device = fallbackPlatform;
    icon = /iPhone|iPad|Android|Mobile/i.test(fallbackPlatform) ? "📱" : "🖥️";
  }

  // Detect Browser & Major Version
  const samsungMatch = ua.match(/SamsungBrowser\/(\d+)/i);
  const edgeMatch = ua.match(/Edg(?:e|A|IOS)?\/(\d+)/i);
  const operaMatch = ua.match(/(?:OPR|Opera)\/(\d+)/i);
  const chromeMatch = ua.match(/(?:Chrome|CriOS)\/(\d+)/i);
  const firefoxMatch = ua.match(/(?:Firefox|FxiOS)\/(\d+)/i);
  const safariVersionMatch = ua.match(/Version\/(\d+)(?:\.\d+)*.*Safari/i);

  if (samsungMatch) {
    browser = `Samsung Internet ${samsungMatch[1]}`;
  } else if (edgeMatch) {
    browser = `Edge ${edgeMatch[1]}`;
  } else if (operaMatch) {
    browser = `Opera ${operaMatch[1]}`;
  } else if (chromeMatch) {
    browser = `Chrome ${chromeMatch[1]}`;
  } else if (firefoxMatch) {
    browser = `Firefox ${firefoxMatch[1]}`;
  } else if (safariVersionMatch) {
    browser = `Safari ${safariVersionMatch[1]}`;
  } else if (/Safari/i.test(ua)) {
    browser = "Safari";
  }

  return { device, icon, browser };
}

function cleanPagePath(rawUrl?: string): string {
  if (!rawUrl) return "/";
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const parsed = new URL(rawUrl);
      return parsed.pathname + (parsed.search || "");
    }
    return rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  } catch {
    return rawUrl;
  }
}

function formatSubmittedDate(dateInput?: Date | string | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

@injectable()
export class TelegramNotificationService {
  public isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  }

  public async sendFeedbackNotification(feedback: any): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn("[TelegramService] Telegram credentials (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) not configured. Skipping notification.");
      return;
    }

    const { emoji: typeEmoji, label: typeLabel } = parseType(feedback.type);
    const username = feedback.userId?.username || feedback.userId?.name || feedback.userId?.email || (feedback.userId ? "Registered User" : "Guest");

    const context = feedback.context || {};
    const rawUserAgent = context.userAgent || "";
    const rawPlatform = context.platform || "";
    const { device, icon: deviceIcon, browser } = parseUserAgent(rawUserAgent, rawPlatform);
    const page = cleanPagePath(context.url);
    const dateStr = formatSubmittedDate(feedback.createdAt);

    const text = [
      `🔔 <b>New TVTrac Feedback</b>`,
      ``,
      `${typeEmoji} <b>Type:</b> ${escapeHtml(typeLabel)}`,
      ``,
      `👤 <b>User:</b> ${escapeHtml(username)}`,
      ``,
      `💬 <b>Message:</b>`,
      `${escapeHtml(feedback.message)}`,
      ``,
      `${deviceIcon} <b>Device:</b> ${escapeHtml(device)}`,
      `🌐 <b>Browser:</b> ${escapeHtml(browser)}`,
      `🔗 <b>Page:</b> ${escapeHtml(page)}`,
      `🕐 <b>Submitted:</b> ${escapeHtml(dateStr)}`,
    ].join("\n");

    try {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(
        url,
        {
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
        { timeout: 10000 }
      );

      logger.info(`[TelegramService] Telegram notification sent successfully for feedback: ${feedback._id}`);
    } catch (err: any) {
      const errMsg = err.response?.data?.description || err.message;
      logger.error("[TelegramService] Failed to send Telegram notification:", { error: errMsg });
      // Re-throw so BullMQ worker can handle retry
      throw new Error(`Telegram API Error: ${errMsg}`);
    }
  }
}
