import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { Table } from '../../components/Table';
import { useAuth } from '../../lib/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { ProductFormPage, ProductsPage } from './products';
import { PlanFormPage, PlansPage } from './plans';
import { DiscountPage } from './discounts';

const PAGE_SIZE = 20;
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api')
  .replace(/\/$/, '');
const initialForm = { name: '', type: 'PERCENT', rate: '0' };

function TaxPage() {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [taxes, setTaxes] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingTax, setEditingTax] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [taxToDisable, setTaxToDisable] = useState(null);
  const [disabling, setDisabling] = useState(false);

  const loadTaxes = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const response = await axios.get(`${API_BASE_URL}/taxes`, {
        params: { page, pageSize: PAGE_SIZE },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });

      setTaxes(response.data.data);
      setTotal(response.data.total);
    } catch (requestError) {
      const message = requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load taxes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, refreshKey]);

  useEffect(() => {
    loadTaxes();
  }, [loadTaxes]);

  const openCreateModal = () => {
    setEditingTax(null);
    setForm(initialForm);
    setFormOpen(true);
    setFormError('');
    setError('');
  };

  const openEditModal = (tax) => {
    setEditingTax(tax);
    setForm({ name: tax.name, type: tax.type, rate: String(tax.rate) });
    setFormOpen(true);
    setFormError('');
    setError('');
  };

  const closeFormModal = () => {
    if (!saving) setFormOpen(false);
  };

  const saveTax = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    const body = { ...form, rate: Number(form.rate) };
    try {
      if (editingTax) {
        await api.patch(`/taxes/${editingTax.id}`, body);
      } else {
        await api.post('/taxes', body);
      }

      setFormOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setFormError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const setTaxActive = async (tax, isActive) => {
    setError('');
    try {
      await api.patch(`/taxes/${tax.id}`, { isActive });
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const disableTax = async () => {
    if (!taxToDisable) return;
    setDisabling(true);
    setError('');

    try {
      await api.delete(`/taxes/${taxToDisable.id}`);
      setTaxToDisable(null);
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setDisabling(false);
    }
  };

  const columns = useMemo(() => {
    const result = [
      { key: 'name', header: 'TAX NAME', accessor: 'name' },
      {
        key: 'type',
        header: 'TYPE',
        render: (tax) => tax.type === 'PERCENT' ? 'Percentage' : 'Fixed amount',
      },
      {
        key: 'rate',
        header: 'RATE',
        cellClassName: 'tabular-nums',
        render: (tax) => tax.type === 'PERCENT'
          ? `${Number(tax.rate).toFixed(2)}%`
          : new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
          }).format(Number(tax.rate)),
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (tax) => (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
            tax.isActive
              ? 'bg-status-success-soft text-status-success'
              : 'bg-status-neutral-soft text-status-neutral'
          }`}>
            {tax.isActive ? 'Active' : 'Inactive'}
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
        render: (tax) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Pencil}
              onClick={() => openEditModal(tax)}
              aria-label={`Edit ${tax.name}`}
            >
              Edit
            </Button>
            {tax.isActive ? (
              <Button
                variant="outline"
                size="sm"
                icon={Trash2}
                onClick={() => setTaxToDisable(tax)}
                aria-label={`Deactivate ${tax.name}`}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                onClick={() => setTaxActive(tax, true)}
                aria-label={`Activate ${tax.name}`}
              >
                Activate
              </Button>
            )}
          </div>
        ),
      });
    }

    return result;
  }, [isAdmin]);

  return (
    <div>
      <PageHeader
        title="Taxes"
        subtitle="Manage tax rules used across your product catalog."
        actions={isAdmin && (
          <Button icon={Plus} onClick={openCreateModal}>New tax</Button>
        )}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger"
        >
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadTaxes}>Retry</Button>
          </div>
        </div>
      )}

      <Card padding={false}>
        <Table
          columns={columns}
          data={taxes}
          loading={loading}
          emptyMessage="No taxes have been created yet."
          emptyActionLabel={isAdmin ? 'Create tax' : undefined}
          onEmptyAction={isAdmin ? openCreateModal : undefined}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={closeFormModal}
        title={editingTax ? 'Edit tax' : 'New tax'}
        subtitle="Define how tax is calculated for applicable products."
      >
        <form onSubmit={saveTax} className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger">
              {formError}
            </p>
          )}
          <Input
            label="Tax name"
            name="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. GST 18%"
            required
            maxLength={120}
          />
          <Select
            label="Tax type"
            name="type"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            required
          >
            <option value="PERCENT">Percentage</option>
            <option value="FIXED">Fixed amount per line</option>
          </Select>
          <Input
            label={form.type === 'PERCENT' ? 'Rate (%)' : 'Amount (INR)'}
            name="rate"
            type="number"
            value={form.rate}
            onChange={(event) => setForm({ ...form, rate: event.target.value })}
            min="0"
            max="999999.99"
            step="0.01"
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeFormModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingTax ? 'Save changes' : 'Create tax'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!taxToDisable}
        onClose={() => !disabling && setTaxToDisable(null)}
        onConfirm={disableTax}
        title="Deactivate tax?"
        message={`${taxToDisable?.name || 'This tax'} will be unavailable for new catalog selections. Existing records will be preserved.`}
        confirmLabel="Deactivate"
        loading={disabling}
      />
    </div>
  );
}

export const routes = [
  { path: '/products', element: <ProductsPage />, area: 'admin' },
  { path: '/products/new', element: <ProductFormPage />, area: 'admin', roles: ['ADMIN'] },
  { path: '/products/:id/edit', element: <ProductFormPage />, area: 'admin', roles: ['ADMIN'] },
  { path: '/plans', element: <PlansPage />, area: 'admin' },
  { path: '/plans/new', element: <PlanFormPage />, area: 'admin', roles: ['ADMIN'] },
  { path: '/plans/:id/edit', element: <PlanFormPage />, area: 'admin', roles: ['ADMIN'] },
  { path: '/discounts', element: <DiscountPage />, area: 'admin' },
  { path: '/taxes', element: <TaxPage />, area: 'admin' },
];

export const navItems = [
  { label: 'Products', path: '/products', roles: ['ADMIN', 'STAFF'] },
  { label: 'Plans', path: '/plans', roles: ['ADMIN', 'STAFF'] },
  { label: 'Discounts', path: '/discounts', roles: ['ADMIN', 'STAFF'] },
  { label: 'Taxes', path: '/taxes', roles: ['ADMIN', 'STAFF'] },
];
