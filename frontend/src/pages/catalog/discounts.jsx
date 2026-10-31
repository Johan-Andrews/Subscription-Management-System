import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

const PAGE_SIZE = 20;
const PRODUCT_PAGE_SIZE = 10;
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api')
  .replace(/\/$/, '');
const EMPTY_DISCOUNT = {
  name: '',
  type: 'PERCENT',
  value: '',
  minPurchase: '0',
  minQty: '0',
  startDate: '',
  endDate: '',
  usageLimit: '',
  scope: 'SUBSCRIPTION',
  productIds: [],
  isActive: true,
};

const STATUS_STYLES = {
  ACTIVE: 'bg-status-success-soft text-status-success',
  UPCOMING: 'bg-status-info-soft text-brand',
  EXPIRED: 'bg-status-neutral-soft text-status-neutral',
  EXHAUSTED: 'bg-status-warning-soft text-status-warning',
  DISABLED: 'bg-status-neutral-soft text-status-neutral',
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

function formatAmount(value) {
  const [whole = '0', fraction = ''] = String(value ?? '0').split('.');
  const amount = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Number(whole));
  return `₹${amount}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN');
}

function DiscountPage() {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const getHeaders = useApiHeaders();
  const [discounts, setDiscounts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [form, setForm] = useState(EMPTY_DISCOUNT);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discountToDelete, setDiscountToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchFilter, setProductSearchFilter] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [products, setProducts] = useState([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getHeaders();
      const response = await axios.get(`${API_BASE_URL}/discounts`, {
        params: { page, pageSize: PAGE_SIZE },
        headers,
      });
      setDiscounts(response.data.data);
      setTotal(response.data.total);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load discounts'
      );
    } finally {
      setLoading(false);
    }
  }, [getHeaders, page, refreshKey]);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProductPage(1);
      setProductSearchFilter(productSearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  const loadProducts = useCallback(async () => {
    if (!modalOpen || form.scope !== 'PRODUCT') return;
    setProductsLoading(true);
    setProductsError('');
    try {
      const headers = await getHeaders();
      const response = await axios.get(`${API_BASE_URL}/products`, {
        params: {
          page: productPage,
          pageSize: PRODUCT_PAGE_SIZE,
          ...(productSearchFilter ? { search: productSearchFilter } : {}),
        },
        headers,
      });
      setProducts(response.data.data);
      setProductTotal(response.data.total);
    } catch (requestError) {
      setProductsError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load products'
      );
    } finally {
      setProductsLoading(false);
    }
  }, [form.scope, getHeaders, modalOpen, productPage, productSearchFilter]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditingDiscount(null);
    setForm({ ...EMPTY_DISCOUNT, productIds: [] });
    setProductSearch('');
    setProductSearchFilter('');
    setProductPage(1);
    setFormError('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = async (discount) => {
    setEditingDiscount(discount);
    setFormError('');
    setError('');
    setModalOpen(true);
    setProductSearch('');
    setProductSearchFilter('');
    setProductPage(1);
    setForm({
      name: discount.name,
      type: discount.type,
      value: String(discount.value),
      minPurchase: String(discount.minPurchase),
      minQty: String(discount.minQty),
      startDate: discount.startDate ? String(discount.startDate).slice(0, 10) : '',
      endDate: discount.endDate ? String(discount.endDate).slice(0, 10) : '',
      usageLimit: discount.usageLimit === null ? '' : String(discount.usageLimit),
      scope: discount.scope,
      productIds: discount.productIds || [],
      isActive: discount.isActive,
    });

    if (!discount.productIds?.length) return;
    try {
      const headers = await getHeaders();
      const response = await axios.get(`${API_BASE_URL}/products`, {
        params: { page: 1, pageSize: 100 },
        headers,
      });
      setProducts((current) => {
        const selected = response.data.data.filter((product) => discount.productIds.includes(product.id));
        const missing = current.filter((product) => !response.data.data.some((item) => item.id === product.id));
        return [...selected, ...missing];
      });
    } catch (requestError) {
      setProductsError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load selected products'
      );
    }
  };

  const closeModal = () => {
    if (!saving) setModalOpen(false);
  };

  const toggleProduct = (product) => {
    setForm((current) => {
      const selected = current.productIds.includes(product.id);
      return {
        ...current,
        productIds: selected
          ? current.productIds.filter((id) => id !== product.id)
          : [...current.productIds, product.id],
      };
    });
  };

  const saveDiscount = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const body = {
      ...form,
      value: form.value,
      minPurchase: form.minPurchase || '0',
      minQty: Number(form.minQty || 0),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      productIds: form.scope === 'PRODUCT' ? form.productIds : [],
    };

    try {
      if (editingDiscount) {
        await api.patch(`/discounts/${editingDiscount.id}`, body);
      } else {
        await api.post('/discounts', body);
      }
      setModalOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setFormError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDiscount = async () => {
    if (!discountToDelete) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/discounts/${discountToDelete.id}`);
      setDiscountToDelete(null);
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
        header: 'DISCOUNT',
        render: (discount) => (
          <div>
            <p className="font-medium text-surface-text">{discount.name}</p>
            <p className="text-[12px] text-surface-muted">
              {discount.scope === 'PRODUCT' ? 'Selected products' : 'Entire subscription'}
            </p>
          </div>
        ),
      },
      {
        key: 'value',
        header: 'VALUE',
        cellClassName: 'tabular-nums',
        render: (discount) => discount.type === 'PERCENT'
          ? `${Number(discount.value).toFixed(2)}%`
          : formatAmount(discount.value),
      },
      {
        key: 'criteria',
        header: 'MINIMUM',
        render: (discount) => (
          <div className="text-[12px]">
            <p>Purchase: {formatAmount(discount.minPurchase)}</p>
            <p className="text-surface-muted">Quantity: {discount.minQty}</p>
          </div>
        ),
      },
      {
        key: 'window',
        header: 'VALIDITY',
        render: (discount) => (
          <span className="text-[12px]">
            {formatDate(discount.startDate)} – {formatDate(discount.endDate)}
          </span>
        ),
      },
      {
        key: 'usage',
        header: 'USAGE',
        cellClassName: 'tabular-nums',
        render: (discount) => `${discount.timesUsed} / ${discount.usageLimit ?? '∞'}`,
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (discount) => (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_STYLES[discount.status] || STATUS_STYLES.DISABLED}`}>
            {discount.status[0] + discount.status.slice(1).toLowerCase()}
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
        render: (discount) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Pencil}
              onClick={() => openEdit(discount)}
              aria-label={`Edit ${discount.name}`}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={() => setDiscountToDelete(discount)}
              aria-label={`Delete ${discount.name}`}
            >
              Delete
            </Button>
          </div>
        ),
      });
    }
    return result;
  }, [isAdmin]);

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="Manage discount rules and review their usage and status."
        actions={isAdmin && <Button icon={Plus} onClick={openCreate}>New discount</Button>}
      />
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger"
        >
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadDiscounts}>Retry</Button>
          </div>
        </div>
      )}
      <Card padding={false}>
        <Table
          columns={columns}
          data={discounts}
          loading={loading}
          emptyMessage="No discounts have been created yet."
          emptyActionLabel={isAdmin ? 'Create discount' : undefined}
          onEmptyAction={isAdmin ? openCreate : undefined}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingDiscount ? 'Edit discount' : 'New discount'}
        subtitle="Set the discount value, eligibility window, and scope."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={saveDiscount} className="space-y-5">
          {formError && (
            <div role="alert" className="rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger">
              {formError}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Discount name"
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={160}
              required
            />
            <Select
              label="Discount type"
              name="type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              required
            >
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount (INR)</option>
            </Select>
            <Input
              label={form.type === 'PERCENT' ? 'Percentage value' : 'Discount amount (INR)'}
              name="value"
              type="number"
              min="0.01"
              max={form.type === 'PERCENT' ? '100' : '9999999999.99'}
              step="0.01"
              value={form.value}
              onChange={(event) => setForm({ ...form, value: event.target.value })}
              required
            />
            <Input
              label="Minimum purchase (INR)"
              name="minPurchase"
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={form.minPurchase}
              onChange={(event) => setForm({ ...form, minPurchase: event.target.value })}
              required
            />
            <Input
              label="Minimum quantity"
              name="minQty"
              type="number"
              min="0"
              step="1"
              value={form.minQty}
              onChange={(event) => setForm({ ...form, minQty: event.target.value })}
              required
            />
            <Input
              label="Usage limit (leave blank for unlimited)"
              name="usageLimit"
              type="number"
              min="1"
              step="1"
              value={form.usageLimit}
              onChange={(event) => setForm({ ...form, usageLimit: event.target.value })}
            />
            <Input
              label="Start date"
              name="startDate"
              type="date"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
            <Input
              label="End date"
              name="endDate"
              type="date"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
            <Select
              label="Scope"
              name="scope"
              value={form.scope}
              onChange={(event) => setForm({
                ...form,
                scope: event.target.value,
                productIds: event.target.value === 'PRODUCT' ? form.productIds : [],
              })}
            >
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="PRODUCT">Selected products</option>
            </Select>
            <label className="flex items-center gap-3 self-end rounded-input border border-surface-border px-3 py-2.5 text-[14px] text-surface-text">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                className="h-4 w-4 accent-brand focus:ring-2 focus:ring-brand"
              />
              Active
            </label>
          </div>

          {form.scope === 'PRODUCT' && (
            <section className="rounded-card border border-surface-border p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[20px] font-semibold text-surface-text">Products</h3>
                  <p className="text-[12px] text-surface-muted">
                    Choose at least one product. {form.productIds.length} selected.
                  </p>
                </div>
                <div className="relative w-full sm:max-w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" aria-hidden="true" />
                  <Input
                    aria-label="Search products to scope discount"
                    className="pl-9"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>
              </div>
              {productsError && (
                <div role="alert" className="mb-3 rounded-card bg-status-danger-soft px-3 py-2 text-[12px] text-status-danger">
                  {productsError}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto divide-y divide-surface-border">
                {productsLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse bg-surface-border/40" />
                  ))
                ) : products.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-surface-muted">No products found.</p>
                ) : products.map((product) => (
                  <label key={product.id} className="flex cursor-pointer items-center gap-3 py-3 text-[14px]">
                    <input
                      type="checkbox"
                      checked={form.productIds.includes(product.id)}
                      onChange={() => toggleProduct(product)}
                      className="h-4 w-4 accent-brand focus:ring-2 focus:ring-brand"
                    />
                    <span className="min-w-0 flex-1 truncate text-surface-text">{product.name}</span>
                    <span className="text-[12px] text-surface-muted">{product.type}</span>
                  </label>
                ))}
              </div>
              <Pagination
                page={productPage}
                pageSize={PRODUCT_PAGE_SIZE}
                total={productTotal}
                onPageChange={setProductPage}
                className="px-0"
              />
            </section>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingDiscount ? 'Save changes' : 'Create discount'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!discountToDelete}
        onClose={() => !deleting && setDiscountToDelete(null)}
        onConfirm={deleteDiscount}
        title="Delete discount?"
        message={`${discountToDelete?.name || 'This discount'} cannot be deleted if it has been applied to an invoice. Deactivate it instead.`}
        confirmLabel="Delete discount"
        loading={deleting}
      />
    </div>
  );
}

export { DiscountPage };
