const QUEUE_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 horas

function setCookie(name: string, value: string, ms: number) {
  const expires = new Date(Date.now() + ms).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Strict`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
}

export function getQueueId(): string | null {
  return localStorage.getItem("barber_queue_id") ?? getCookie("barber_queue_id");
}

export function getQueueCode(): string | null {
  return localStorage.getItem("barber_queue_code") ?? getCookie("barber_queue_code");
}

export function setQueueSession(id: string, code: string) {
  localStorage.setItem("barber_queue_id", id);
  localStorage.setItem("barber_queue_code", code);
  setCookie("barber_queue_id", id, QUEUE_EXPIRY_MS);
  setCookie("barber_queue_code", code, QUEUE_EXPIRY_MS);
}

export function clearQueueSession() {
  localStorage.removeItem("barber_queue_id");
  localStorage.removeItem("barber_queue_code");
  deleteCookie("barber_queue_id");
  deleteCookie("barber_queue_code");
}
