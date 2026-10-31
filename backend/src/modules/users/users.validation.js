const { z } = require('zod');
const { passwordRegex } = require('../auth/auth.validation');

const createStaffSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().regex(
    passwordRegex,
    'Password must be at least 9 characters long and contain at least one uppercase letter, one lowercase letter, and one special character.'
  ),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
});

const updateStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').optional(),
  isActive: z.boolean().optional(),
});

const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email').toLowerCase().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').optional(),
  email: z.string().trim().email('Invalid email').toLowerCase().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

module.exports = {
  createStaffSchema,
  updateStaffSchema,
  createCustomerSchema,
  updateCustomerSchema,
};

