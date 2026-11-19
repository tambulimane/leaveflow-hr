export interface NotifyResult {
  status: "sent" | "logged" | "failed";
  sid?: string;
  detail: string;
}

function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function sendShiftNotification(params: {
  toPhone: string;
  channel: "whatsapp" | "sms" | "both" | "none";
  message: string;
}): Promise<NotifyResult> {
  if (params.channel === "none") {
    return { status: "logged", detail: "Notification skipped by admin" };
  }

  const formattedPhone = normalizeIndianPhone(params.toPhone);
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const smsFrom = process.env.TWILIO_SMS_FROM;           // e.g. +14155238886
  const waFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  // Fallback for local testing when Twilio credentials are not in .env yet
  if (!accountSid || !authToken) {
    console.log(
      `[SHIFT NOTIFIER - DEV LOG] Channel=${params.channel.toUpperCase()} To=${formattedPhone} | ${params.message}`
    );
    return {
      status: "logged",
      detail: `Simulated ${params.channel.toUpperCase()} to ${formattedPhone} (add TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN in .env for live delivery)`,
    };
  }

  const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const targets: Array<{ from: string; to: string }> = [];
  if (params.channel === "whatsapp" || params.channel === "both") {
    targets.push({ from: waFrom, to: `whatsapp:${formattedPhone}` });
  }
  if ((params.channel === "sms" || params.channel === "both") && smsFrom) {
    targets.push({ from: smsFrom, to: formattedPhone });
  }

  try {
    let lastSid = "";
    for (const target of targets) {
      const body = new URLSearchParams({
        From: target.from,
        To: target.to,
        Body: params.message,
      });

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const data = (await resp.json()) as { sid?: string; message?: string };
      if (!resp.ok) {
        return {
          status: "failed",
          detail: data.message || `Twilio error (${resp.status})`,
        };
      }
      lastSid = data.sid || lastSid;
    }

    return {
      status: "sent",
      sid: lastSid,
      detail: `Delivered via ${params.channel.toUpperCase()} to ${formattedPhone}`,
    };
  } catch (err) {
    return {
      status: "failed",
      detail: err instanceof Error ? err.message : "Network error sending message",
    };
  }
}
