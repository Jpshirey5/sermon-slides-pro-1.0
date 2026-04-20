export function formatDateOnlyForDisplay(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
  locale = "en-US"
): string {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return new Date(dateString).toLocaleDateString(locale, options);
  }

  const [, year, month, day] = match;
  const localDate = new Date(Number(year), Number(month) - 1, Number(day));
  return localDate.toLocaleDateString(locale, options);
}
