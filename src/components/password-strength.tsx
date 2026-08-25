import { MIN_LENGTH, scorePassword } from "@/lib/password";

const BAR_COLORS = ["bg-zinc-800", "bg-red-500", "bg-amber-500", "bg-teal-500", "bg-green-500"];
const LABEL_COLORS = [
  "text-zinc-500",
  "text-red-400",
  "text-amber-400",
  "text-teal-400",
  "text-green-400",
];

export function PasswordStrength({ password, email }: { password: string; email?: string }) {
  const { score, label, hint, ok } = scorePassword(password, email);

  if (!password) {
    return (
      <p
        className="mt-2 text-[11px] leading-relaxed text-zinc-400"
        data-testid="password-requirements"
      >
        Minimum {MIN_LENGTH} characters. Avoid common passwords like &quot;password123&quot;. A
        4-word phrase works well.
      </p>
    );
  }

  return (
    <div className="mt-2" data-testid="password-strength-meter">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? BAR_COLORS[score] : "bg-zinc-800"}`}
          />
        ))}
      </div>
      <p className={`mt-1.5 text-[11px] leading-relaxed ${LABEL_COLORS[score]}`}>
        <span className="font-semibold">{label}.</span>{" "}
        <span className={ok ? "text-zinc-400" : "text-zinc-500"}>{hint}</span>
      </p>
    </div>
  );
}
