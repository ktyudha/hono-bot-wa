export function formatPhoneNumber(to: string): string {
  let formattedNumber = to.replace(/\D/g, "");

  if (formattedNumber.startsWith("0")) {
    formattedNumber = "62" + formattedNumber.slice(1);
  }

  if (!formattedNumber.startsWith("62")) {
    formattedNumber = "62" + formattedNumber;
  }
  return formattedNumber;
}
