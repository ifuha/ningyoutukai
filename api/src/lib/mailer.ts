/**
 * メール送信(Resend の REST API)。通知は補助機能なので、失敗しても API 自体は失敗させない。
 * - `RESEND_API_KEY` が無いときは送らず、ログだけ出す(ローカル開発・テスト用)
 * - 送信元は `MAIL_FROM`(例: `人形使い <noreply@example.com>`)
 *
 * テストでは `spyOn(mailer, "send")` で差し替えて、実際には送らずに呼び出しを検証する。
 */
export type Mail = { to: string | string[]; subject: string; text: string };
export type MailResult = { ok: true } | { ok: false; skipped?: true; error?: string };

export const mailer = {
  async send(mail: Mail): Promise<MailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[mailer] RESEND_API_KEY が未設定のため送信しません: ${mail.subject}`);
      return { ok: false, skipped: true };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? "onboarding@resend.dev",
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
        }),
      });
      if (!res.ok) {
        const error = `Resend ${res.status}: ${await res.text()}`;
        console.error(`[mailer] ${error}`);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[mailer] ${error}`);
      return { ok: false, error };
    }
  },
};
