import { waLink } from "@/lib/whatsapp";

export default function WhatsAppButton({
  phone,
  message,
  label,
  compact = false,
}: {
  phone: string;
  message?: string;
  label?: string;
  compact?: boolean;
}) {
  const icon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={compact ? "h-4 w-4" : "h-4 w-4"}>
      <path
        d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"
        strokeLinejoin="round"
      />
      <path
        d="M9 8.8c.2-.5.7-.6 1-.3l.9 1.1c.2.3.1.6-.1.9l-.4.4c.5 1 1.4 1.9 2.5 2.4l.4-.4c.2-.3.6-.3.9-.1l1.1.8c.4.3.3.8-.2 1-.9.5-2 .4-2.9-.1a9.4 9.4 0 0 1-3.3-3.2c-.5-.9-.5-1.7.1-2.5z"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (compact) {
    return (
      <a
        href={waLink(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        title="Escribir por WhatsApp"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-50"
      >
        {icon}
      </a>
    );
  }

  return (
    <a
      href={waLink(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
    >
      {icon}
      {label ?? "WhatsApp"}
    </a>
  );
}
