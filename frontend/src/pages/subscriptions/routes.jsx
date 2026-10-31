import React from 'react';
import QuotationTemplatesListPage from './QuotationTemplatesListPage';
import SubscriptionsListPage from './SubscriptionsListPage';
import SubscriptionCreatePage from './SubscriptionCreatePage';
import SubscriptionDetailPage from './SubscriptionDetailPage';

export const routes = [
  {
    path: '/subscriptions',
    element: <SubscriptionsListPage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
  {
    path: '/subscriptions/new',
    element: <SubscriptionCreatePage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
  {
    path: '/subscriptions/:id',
    element: <SubscriptionDetailPage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
  {
    path: '/quotation-templates',
    element: <QuotationTemplatesListPage />,
    area: 'admin',
    roles: ['ADMIN', 'STAFF'],
  },
];

export const navItems = [
  {
    label: 'Subscriptions',
    path: '/subscriptions',
    roles: ['ADMIN', 'STAFF'],
  },
  {
    label: 'Quotation Templates',
    path: '/quotation-templates',
    roles: ['ADMIN', 'STAFF'],
  },
];
