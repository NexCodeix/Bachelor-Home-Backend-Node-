const UPPER_ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateNumericOtp(length: number): string {
  const max = 10 ** length;
  const min = 10 ** (length - 1);
  return Math.floor(Math.random() * (max - min) + min).toString();
}

export function generateInviteCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * UPPER_ALPHANUMERIC.length);
    code += UPPER_ALPHANUMERIC[randomIndex];
  }

  return code;
}
