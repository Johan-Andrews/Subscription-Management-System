import React from 'react';
import { StaffListPage } from './StaffListPage';
import { CustomerListPage } from './CustomerListPage';
import { CustomerProfilePage } from './CustomerProfilePage';

export const routes = [
  {
    path: '/users/staff',
    element: <StaffListPage />,
    area: 'admin',
    roles: ['ADMIN'],
  },
  {
    path: '/customers',
    element: <CustomerListPage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
  {
    path: '/portal/profile',
    element: <CustomerProfilePage />,
    area: 'portal',
    roles: ['CUSTOMER'],
  },
];

export const navItems = [
  {
    label: 'Customers',
    path: '/customers',
    roles: ['ADMIN', 'STAFF'],
    group: 'CRM',
  },
  {
    label: 'Staff Members',
    path: '/users/staff',
    roles: ['ADMIN'],
    group: 'Admin',
  },
];
