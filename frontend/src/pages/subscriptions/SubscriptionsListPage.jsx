import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Table } from '../../components/Table';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Pagination } from '../../components/Pagination';
import { Plus, Search, Eye, Repeat, Calendar, User } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Quotation', value: 'QUOTATION' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Closed', value: 'CLOSED' },
];

export const SubscriptionsListPage = () => {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  // Load plans for filter dropdown
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/plans');
        const list = Array.isArray(res) ? res : res?.data || res?.items || [];
        setPlans(list);
      } catch (err) {
        // quiet error if plans not seeded yet
      }
    };
    fetchPlans();
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (selectedPlanId) params.planId = selectedPlanId;

      const res = await api.get('/subscriptions', { params });
      if (Array.isArray(res)) {
        setSubscriptions(res);
        setTotal(res.length);
      } else if (res?.data && Array.isArray(res.data)) {
        setSubscriptions(res.data);
        setTotal(res.total || res.data.length);
      } else if (res?.items && Array.isArray(res.items)) {
        setSubscriptions(res.items);
        setTotal(res.total || res.items.length);
      } else {
        setSubscriptions([]);
        setTotal(0);
      }
    } catch (err) {
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, selectedPlanId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const getStatusBadge = (status, isPaused) => {
    if (isPaused) {
      return <Badge variant="warning">Paused</Badge>;
    }
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">Draft</Badge>;
      case 'QUOTATION':
        return <Badge variant="info">Quotation</Badge>;
      case 'CONFIRMED':
        return <Badge variant="info" className="bg-indigo-50 text-indigo-700 border-indigo-200">Confirmed</Badge>;
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'CLOSED':
        return <Badge variant="neutral" className="bg-slate-200 text-slate-800">Closed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const columns = [
    {
      header: 'Subscription #',
      key: 'number',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <span
              onClick={() => navigate(`/subscriptions/${row.id}`)}
              className="font-semibold text-brand hover:underline cursor-pointer tabular-nums"
            >
              {row.number}
            </span>
            <div className="text-[11px] text-surface-muted">
              {row.line_count || 1} line item{(row.line_count || 1) === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Customer',
      key: 'customer_name',
      render: (row) => (
        <div>
          <div className="font-medium text-surface-text flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-surface-muted" />
            {row.customer_name}
          </div>
          {row.customer_company && (
            <div className="text-[12px] text-surface-muted truncate max-w-xs">
              {row.customer_company}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Plan',
      key: 'plan_name',
      render: (row) => (
        <div>
          <div className="font-medium text-surface-text">{row.plan_name}</div>
          <div className="text-[12px] text-surface-muted">
            {row.plan_billing_period} • ₹{parseFloat(row.plan_price || 0).toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row) => getStatusBadge(row.status, row.is_paused),
    },
    {
      header: 'Next Billing',
      key: 'next_billing_date',
      render: (row) => (
        <div className="flex items-center gap-1.5 text-surface-muted text-[13px] tabular-nums">
          <Calendar className="w-3.5 h-3.5" />
          {row.next_billing_date || '—'}
        </div>
      ),
    },
    {
      header: 'Subtotal',
      key: 'subtotal',
      className: 'text-right tabular-nums',
      render: (row) => (
        <span className="font-semibold text-surface-text">
          ₹{parseFloat(row.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: '',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          icon={Eye}
          onClick={() => navigate(`/subscriptions/${row.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring customer contracts, quotation lifecycles, and automated billing."
        action={
          <Button icon={Plus} onClick={() => navigate('/subscriptions/new')}>
            New Subscription
          </Button>
        }
      />

      {/* Filter Bar with Status Tabs */}
      <div className="bg-white rounded-[16px] border border-surface-border p-4 shadow-card space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-surface-border">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-surface-muted hover:text-surface-text hover:bg-surface-canvas'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Plan Selector */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-96 relative">
            <Search className="w-4 h-4 text-surface-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by SUB #, customer name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-[13px] bg-surface-canvas/50 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white transition-all"
            />
          </div>

          <div className="w-full md:w-auto flex items-center gap-3">
            <select
              value={selectedPlanId}
              onChange={(e) => {
                setSelectedPlanId(e.target.value);
                setPage(1);
              }}
              className="text-[13px] px-3 py-2 bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">All Plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.billing_period || p.billingPeriod})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-[16px] border border-surface-border shadow-card overflow-hidden">
        <Table
          columns={columns}
          data={subscriptions}
          loading={loading}
          emptyMessage="No subscriptions found matching the selected criteria."
          emptyActionLabel="Create Subscription"
          onEmptyAction={() => navigate('/subscriptions/new')}
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </div>
    </div>
  );
};

export default SubscriptionsListPage;

