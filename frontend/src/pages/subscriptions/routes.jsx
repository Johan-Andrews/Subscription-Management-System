import React from 'react';
import QuotationTemplatesListPage from './QuotationTemplatesListPage';

export const routes = [
  {
    path: '/quotation-templates',
    element: <QuotationTemplatesListPage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
];

export const navItems = [
  {
    label: 'Quotation Templates',
    path: '/quotation-templates',
    roles: ['ADMIN', 'STAFF'],
  },
];
