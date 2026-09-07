/**
 * Indian mobile number handling.
 *
 * The join page asks for the number linked to WhatsApp, so we normalise to
 * E.164 and reject anything that can't be an Indian mobile. Landlines and
 * short codes have no WhatsApp account, and letting one through means a guest
 * who never hears their table is ready.
 */

const IN_MOBILE = /^[6-9]\d{9}$/;

export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 10 ? digits
    : digits.length === 12 && digits.startsWith("91") ? digits.slice(2)
    : digits.length === 13 && digits.startsWith("091") ? digits.slice(3)
    : digits.length === 11 && digits.startsWith("0") ? digits.slice(1)
    : null;

  if (!local || !IN_MOBILE.test(local)) return null;
  return `+91${local}`;
}

export function maskPhone(e164: string | null): string {
  if (!e164) return "—";
  return e164.replace(/^\+91(\d{5})(\d{5})$/, "+91 •••••$2");
}

export function displayPhone(e164: string | null): string {
  if (!e164) return "—";
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
