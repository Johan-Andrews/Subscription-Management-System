import React from 'react';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

export const routes = [
  { path: '/login', element: <LoginPage />, area: 'public' },
  { path: '/signup', element: <SignupPage />, area: 'public' },
  { path: '/forgot-password', element: <ForgotPasswordPage />, area: 'public' },
  { path: '/reset-password', element: <ResetPasswordPage />, area: 'public' },
];

export const navItems = [];
