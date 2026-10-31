import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { Badge } from '../../../components/Badge';
import {
  Repeat,
  Calendar,
  CreditCard,
  Layers,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

export const PortalSubscriptionsListPage = () => {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchPortalSubscriptions = async () => {
      try {
        setLoading(true);
        // GET /api/subscriptions automatically scopes to customerId on backend
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (statusFilter) params.status = statusFilter;

        const res = await api.get('/subscriptions', { params });
        const list = Array.isArray(res)
          ? res
          : res?.data && Array.isArray(res.data)
          ? res.data
          : res?.items || [];
        setSubscriptions(list);
      } catch (err) {
        toast.error('Failed to load your subscriptions');
      } finally {
        setLoading(false);
      }
    };

    fetchPortalSubscriptions();
  }, [search, statusFilter]);

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
        return (
          <Badge variant="info" className="bg-indigo-50 text-indigo-700 border-indigo-200">
            Confirmed
          </Badge>
        );
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'CLOSED':
        return (
          <Badge variant="neutral" className="bg-slate-200 text-slate-800">
            Closed
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-surface-text">My Subscriptions</h1>
          <p className="text-[14px] text-surface-muted mt-1">
            Review your recurring software plans, upcoming billing dates, and manage subscriptions.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-surface-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subscriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[13px] px-3 py-1.5 bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="QUOTATION">Quotation</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Subscription Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-[16px] border border-surface-border p-6 shadow-card animate-pulse space-y-4"
            >
              <div className="h-6 bg-surface-canvas rounded w-1/3"></div>
              <div className="h-4 bg-surface-canvas rounded w-1/2"></div>
              <div className="h-10 bg-surface-canvas rounded"></div>
            </div>
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="bg-white rounded-[16px] border border-surface-border p-12 text-center shadow-card">
          <div className="w-14 h-14 rounded-full bg-surface-canvas flex items-center justify-center mx-auto mb-4 text-surface-muted">
            <Repeat className="w-7 h-7" />
          </div>
          <h3 className="text-[18px] font-semibold text-surface-text mb-1">
            No subscriptions found
          </h3>
          <p className="text-[14px] text-surface-muted max-w-md mx-auto">
            You do not currently have any active or past subscriptions matching the selected filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subscriptions.map((sub) => {
            const isPaused = sub.is_paused;
            return (
              <div
                key={sub.id}
                className="bg-white rounded-[16px] border border-surface-border p-6 shadow-card hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-semibold text-brand tracking-wider tabular-nums">
                      {sub.number}
                    </span>
                    {getStatusBadge(sub.status, isPaused)}
                  </div>

                  <h3 className="text-[20px] font-bold text-surface-text mb-1">
                    {sub.plan_name}
                  </h3>
                  <div className="text-[13px] text-surface-muted flex items-center gap-1.5 mb-4">
                    <span>
                      {sub.plan_billing_period} plan • ₹
                      {parseFloat(sub.plan_price || 0).toLocaleString()} / period
                    </span>
                  </div>

                  <div className="bg-surface-canvas/50 rounded-xl p-3.5 space-y-2 text-[13px] mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-surface-muted flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> Next Billing Date
                      </span>
                      <span className="font-semibold text-surface-text tabular-nums">
                        {sub.next_billing_date || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-surface-muted flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> Items
                      </span>
                      <span className="font-medium text-surface-text">
                        {sub.line_count || 1} product line{(sub.line_count || 1) === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-surface-border/60 pt-2">
                      <span className="text-surface-muted flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" /> Recurring Amount
                      </span>
                      <span className="font-bold text-[15px] text-brand tabular-nums">
                        ₹
                        {parseFloat(sub.subtotal || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigate(`/portal/subscriptions/${sub.id}`)}
                  >
                    <span>Manage Subscription</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PortalSubscriptionsListPage;
