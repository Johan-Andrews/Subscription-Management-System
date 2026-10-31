import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/Input';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { Table } from '../../components/Table';
import { useAuth } from '../../lib/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;
const BILLING_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api')
  .replace(/\/$/, '');
const EMPTY_PLAN = {
  name: '',
  price: '',
  billingPeriod: 'MONTHLY',
  minQty: '1',
  availableFrom: '',
  availableTo: '',
  autoClose: false,
  closable: false,
  pausable: false,
  renewable: false,
  isActive: true,
};

const FLAG_LABELS = {
  autoClose: 'Auto-close',
  closable: 'Closable',
  pausable: 'Pausable',
  renewable: 'Renewable',
};

const FLAG_HELP = {
  autoClose: 'Subscription closes by itself at its expiry date.',
  closable: 'A subscription can be closed before its expiry date.',
  pausable: 'A subscription can be paused and resumed.',
  renewable: 'A closed subscription can be renewed.',
};

function useApiHeaders() {
  return useCallback(async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }, []);
}

function formatPrice(value) {
  const [whole = '0', fraction = ''] = String(value ?? '0').split('.');
  const formattedWhole = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(whole));
  return `₹${formattedWhole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function availabilityWindow(plan) {
  if (!plan.availableFrom && !plan.availableTo) return 'Always available';
  return `${plan.availableFrom || 'Open'} – ${plan.availableTo || 'Open'}`;
}

function PlanFlags({ plan }) {
  const enabledFlags = Object.keys(FLAG_LABELS).filter((key) => plan[key]);
  if (enabledFlags.length === 0) {
    return <span className="text-[12px] text-surface-muted">No lifecycle flags</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {enabledFlags.map((key) => (
        <span
          key={key}
          className="inline-flex items-center rounded-full bg-status-info-soft px-2.5 py-0.5 text-[12px] font-medium text-brand"
          title={FLAG_HELP[key]}
        >
          {FLAG_LABELS[key]}
        </span>
      ))}
    </div>
  );
}

function PlansPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const getHeaders = useApiHeaders();
  const isAdmin = role === 'ADMIN';
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [billingPeriod, setBillingPeriod] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [planToDelete, setPlanToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchFilter(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getHeaders();
      const response = await axios.get(`${API_BASE_URL}/plans`, {
        params: {
          page,
          pageSize: PAGE_SIZE,
          ...(searchFilter ? { search: searchFilter } : {}),
          ...(billingPeriod ? { billingPeriod } : {}),
        },
        headers,
      });
      setPlans(response.data.data);
      setTotal(response.data.total);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load plans'
      );
    } finally {
      setLoading(false);
    }
  }, [billingPeriod, getHeaders, page, refreshKey, searchFilter]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const setPlanActive = async (plan, isActive) => {
    setError('');
    try {
      await api.patch(`/plans/${plan.id}`, { isActive });
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const deletePlan = async () => {
    if (!planToDelete) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/plans/${planToDelete.id}`);
      setPlanToDelete(null);
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => {
    const result = [
      {
        key: 'name',
        header: 'PLAN',
        render: (plan) => (
          <div>
            <p className="font-medium text-surface-text">{plan.name}</p>
            <p className="text-[12px] text-surface-muted">Minimum quantity: {plan.minQty}</p>
          </div>
        ),
      },
      {
        key: 'period',
        header: 'BILLING PERIOD',
        render: (plan) => plan.billingPeriod[0] + plan.billingPeriod.slice(1).toLowerCase(),
      },
      {
        key: 'price',
        header: 'PRICE',
        cellClassName: 'tabular-nums',
        render: (plan) => formatPrice(plan.price),
      },
      {
        key: 'availability',
        header: 'AVAILABILITY',
        render: (plan) => availabilityWindow(plan),
      },
      {
        key: 'flags',
        header: 'PLAN FLAGS',
        render: (plan) => <PlanFlags plan={plan} />,
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (plan) => (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
            plan.isActive
              ? 'bg-status-success-soft text-status-success'
              : 'bg-status-neutral-soft text-status-neutral'
          }`}>
            {plan.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
    ];

    if (isAdmin) {
      result.push({
        key: 'actions',
        header: 'ACTIONS',
        className: 'text-right',
        cellClassName: 'text-right',
        render: (plan) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Pencil}
              onClick={() => navigate(`/plans/${plan.id}/edit`)}
              aria-label={`Edit ${plan.name}`}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlanActive(plan, !plan.isActive)}
            >
              {plan.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={() => setPlanToDelete(plan)}
              aria-label={`Delete ${plan.name}`}
            >
              Delete
            </Button>
          </div>
        ),
      });
    }
    return result;
  }, [isAdmin, navigate]);

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle="Configure billing periods, availability, and subscription lifecycle rules."
        actions={isAdmin && (
          <Button icon={Plus} onClick={() => navigate('/plans/new')}>New plan</Button>
        )}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" aria-hidden="true" />
          <Input
            aria-label="Search plans"
            className="pl-9"
            placeholder="Search plans..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by billing period"
          className="sm:max-w-56"
          value={billingPeriod}
          onChange={(event) => {
            setBillingPeriod(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All periods</option>
          {BILLING_PERIODS.map((period) => (
            <option key={period} value={period}>
              {period[0] + period.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger"
        >
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadPlans}>Retry</Button>
          </div>
        </div>
      )}
      <Card padding={false}>
        <Table
          columns={columns}
          data={plans}
          loading={loading}
          emptyMessage="No plans have been created yet."
          emptyActionLabel={isAdmin ? 'Create plan' : undefined}
          onEmptyAction={isAdmin ? () => navigate('/plans/new') : undefined}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </Card>
      <ConfirmDialog
        isOpen={!!planToDelete}
        onClose={() => !deleting && setPlanToDelete(null)}
        onConfirm={deletePlan}
        title="Delete plan?"
        message={`${planToDelete?.name || 'This plan'} will be permanently removed if it is not referenced. If it is in use, deactivate it instead.`}
        confirmLabel="Delete plan"
        loading={deleting}
      />
    </div>
  );
}

function PlanFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const getHeaders = useApiHeaders();
  const editing = Boolean(id);
  const [form, setForm] = useState(EMPTY_PLAN);
  const [loading, setLoading] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      setLoading(true);
      setLoadFailed(false);
      setError('');
      if (!editing) {
        setForm(EMPTY_PLAN);
        setLoading(false);
        return;
      }

      try {
        const headers = await getHeaders();
        const response = await axios.get(`${API_BASE_URL}/plans/${id}`, { headers });
        if (!active) return;
        const plan = response.data.data;
        setForm({
          name: plan.name,
          price: String(plan.price),
          billingPeriod: plan.billingPeriod,
          minQty: String(plan.minQty),
          availableFrom: plan.availableFrom || '',
          availableTo: plan.availableTo || '',
          autoClose: plan.autoClose,
          closable: plan.closable,
          pausable: plan.pausable,
          renewable: plan.renewable,
          isActive: plan.isActive,
        });
      } catch (requestError) {
        if (active) {
          setLoadFailed(true);
          setError(
            requestError.response?.data?.error?.message
            || requestError.message
            || 'Unable to load plan'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPlan();
    return () => { active = false; };
  }, [editing, getHeaders, id, loadKey]);

  const savePlan = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      ...form,
      price: form.price,
      minQty: Number(form.minQty),
      availableFrom: form.availableFrom || null,
      availableTo: form.availableTo || null,
    };

    try {
      if (editing) {
        await api.patch(`/plans/${id}`, body);
      } else {
        await api.post('/plans', body);
      }
      navigate('/plans');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={editing ? 'Edit plan' : 'New plan'} />
        <Card className="animate-pulse">
          <div className="h-6 w-1/3 rounded bg-surface-border/60" />
          <div className="mt-6 h-24 rounded bg-surface-border/60" />
          <div className="mt-4 h-24 rounded bg-surface-border/60" />
        </Card>
      </div>
    );
  }

  if (editing && loadFailed) {
    return (
      <div>
        <PageHeader title="Edit plan" />
        <Card>
          <div role="alert" className="mb-4 text-[14px] text-status-danger">{error}</div>
          <Button variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit plan' : 'New plan'}
        subtitle="Set the plan price, billing schedule, availability, and lifecycle options."
        breadcrumbs={<Link className="text-brand-link hover:underline" to="/plans">Plans</Link>}
      />
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger"
        >
          {error}
        </div>
      )}
      <form onSubmit={savePlan} className="space-y-6">
        <Card title="Plan details" subtitle="Pricing and availability settings.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Plan name"
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={160}
              required
            />
            <Input
              label="Price (INR)"
              name="price"
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              required
            />
            <Select
              label="Billing period"
              name="billingPeriod"
              value={form.billingPeriod}
              onChange={(event) => setForm({ ...form, billingPeriod: event.target.value })}
              required
            >
              {BILLING_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {period[0] + period.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              label="Minimum quantity"
              name="minQty"
              type="number"
              min="1"
              step="1"
              value={form.minQty}
              onChange={(event) => setForm({ ...form, minQty: event.target.value })}
              required
            />
            <Input
              label="Available from"
              name="availableFrom"
              type="date"
              value={form.availableFrom}
              onChange={(event) => setForm({ ...form, availableFrom: event.target.value })}
              helperText="Leave blank for no start date."
            />
            <Input
              label="Available to"
              name="availableTo"
              type="date"
              value={form.availableTo}
              onChange={(event) => setForm({ ...form, availableTo: event.target.value })}
              helperText="Leave blank for no end date."
            />
          </div>
        </Card>

        <Card title="Subscription lifecycle" subtitle="Choose which lifecycle actions are allowed for this plan.">
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.keys(FLAG_LABELS).map((flag) => (
              <label
                key={flag}
                className="flex cursor-pointer gap-3 rounded-card border border-surface-border p-4"
              >
                <input
                  type="checkbox"
                  name={flag}
                  checked={form[flag]}
                  onChange={(event) => setForm({ ...form, [flag]: event.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-brand focus:ring-2 focus:ring-brand"
                />
                <span>
                  <span className="block text-[14px] font-medium text-surface-text">
                    {FLAG_LABELS[flag]}
                  </span>
                  <span className="block text-[12px] text-surface-muted">
                    {FLAG_HELP[flag]}
                  </span>
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer gap-3 rounded-card border border-surface-border p-4 sm:col-span-2">
              <input
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                className="mt-0.5 h-4 w-4 accent-brand focus:ring-2 focus:ring-brand"
              />
              <span>
                <span className="block text-[14px] font-medium text-surface-text">Active</span>
                <span className="block text-[12px] text-surface-muted">
                  Active plans can be selected when creating subscriptions.
                </span>
              </span>
            </label>
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/plans')} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export { PlansPage, PlanFormPage };
