import { z } from 'zod';

export const EmailSchema = z.string().trim().email('Enter a valid email address');
/** E.164, e.g. +14155551234. */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +14155551234');
export const OtpSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'Enter the code you received');
export const NewPasswordSchema = z.string().min(8, 'At least 8 characters');
