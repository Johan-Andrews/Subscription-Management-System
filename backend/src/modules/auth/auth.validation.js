const { z } = require('zod');

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$/;
const passwordErrorMessage =
  'Password must be at least 9 characters long and contain at least one uppercase letter, one lowercase letter, and one special character.';

const signupSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().regex(passwordRegex, passwordErrorMessage),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().trim().optional().nullable(),
  role: z.any().optional(), // Accepted in schema to verify it is safely ignored
});

const resetPasswordSchema = z.object({
  password: z.string().regex(passwordRegex, passwordErrorMessage),
});

module.exports = {
  passwordRegex,
  signupSchema,
  resetPasswordSchema,
};
