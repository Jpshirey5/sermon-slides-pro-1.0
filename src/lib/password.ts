export const passwordRules = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  {
    id: "upper",
    label: "At least one uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "lower",
    label: "At least one lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "At least one number",
    test: (password: string) => /\d/.test(password),
  },
  {
    id: "special",
    label: "At least one special character",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export const getPasswordChecks = (password: string) =>
  passwordRules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(password),
  }));

export const isPasswordStrong = (password: string) =>
  passwordRules.every((rule) => rule.test(password));
