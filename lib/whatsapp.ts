// Genera enlaces wa.me para abrir WhatsApp con mensaje prellenado.
// No requiere API ni cuenta empresarial: usa el WhatsApp del usuario.

// Código de país por defecto para números guardados en formato local
const DEFAULT_COUNTRY_CODE = "58"; // Venezuela

export function waLink(phone: string, text?: string): string {
  // wa.me exige solo dígitos con código de país (sin +, espacios ni guiones)
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    // Formato local con 0 inicial (ej. 0412 1234567) → 58412…
    digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  } else if (!digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length <= 10) {
    // Número corto sin código de país → se antepone el 58
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function hasValidPhone(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 8;
}
