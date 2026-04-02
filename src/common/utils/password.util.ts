import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashValue(rawValue: string): Promise<string> {
  return bcrypt.hash(rawValue, SALT_ROUNDS);
}

export async function compareValue(rawValue: string, hash: string): Promise<boolean> {
  return bcrypt.compare(rawValue, hash);
}
