export type PasswordPolicyOptions = {
  email?: string;
  minLength?: number;
  requireUpper?: boolean;
  requireLower?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
  disallowCommon?: boolean;
};

const DEFAULT_OPTIONS: Required<Omit<PasswordPolicyOptions, "email">> = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSpecial: false,
  disallowCommon: true,
};

// Small, curated list to block ultra-common passwords without adding heavy deps.
// (We still recommend enabling leaked-password protection in backend settings.)
const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password123",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "qwerty123",
    "111111",
    "11111111",
    "000000",
    "00000000",
    "admin",
    "admin123",
    "letmein",
    "iloveyou",
  ].map((p) => p.toLowerCase())
);

const normalize = (s: string) => s.trim().toLowerCase();

export function getPasswordIssues(password: string, options: PasswordPolicyOptions = {}): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: string[] = [];

  if (password.length < opts.minLength) {
    issues.push(`密碼長度至少需要 ${opts.minLength} 個字元`);
  }

  if (opts.requireUpper && !/[A-Z]/.test(password)) {
    issues.push("密碼需包含至少一個大寫字母");
  }

  if (opts.requireLower && !/[a-z]/.test(password)) {
    issues.push("密碼需包含至少一個小寫字母");
  }

  if (opts.requireNumber && !/[0-9]/.test(password)) {
    issues.push("密碼需包含至少一個數字");
  }

  if (opts.requireSpecial && !/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
    issues.push("密碼需包含至少一個特殊字元（例如 !@#$%）");
  }

  if (opts.disallowCommon) {
    const n = normalize(password);
    if (COMMON_PASSWORDS.has(n)) {
      issues.push("此密碼過於常見，請更換為更難猜的密碼");
    }
  }

  if (options.email) {
    const email = normalize(options.email);
    const [localPart, domain] = email.split("@");

    // Avoid passwords containing the whole email, local part, or domain prefix.
    const passwordLower = password.toLowerCase();
    if (email && passwordLower.includes(email)) {
      issues.push("密碼不可包含您的電子郵件");
    } else if (localPart && localPart.length >= 3 && passwordLower.includes(localPart)) {
      issues.push("密碼不可包含您的帳號（電子郵件前綴）");
    } else if (domain) {
      const domainPrefix = domain.split(".")[0];
      if (domainPrefix && domainPrefix.length >= 3 && passwordLower.includes(domainPrefix)) {
        issues.push("密碼不可包含您的電子郵件網域");
      }
    }
  }

  return issues;
}
