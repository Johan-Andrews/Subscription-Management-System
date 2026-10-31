import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Input } from '../../components/Input';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { Table } from '../../components/Table';
import { Textarea } from '../../components/Textarea';
import { useAuth } from '../../lib/AuthContext';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;
const PRODUCT_TYPES = ['SERVICE', 'SOFTWARE', 'ADDON', 'GOODS'];
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api')
  .replace(/\/$/, '');
const EMPTY_VARIANT = { attribute: '', value: '', extraPrice: '0' };
const EMPTY_PRODUCT = {
  name: '',
  type: 'SOFTWARE',
  salesPrice: '',
  costPrice: '0',
  notes: '',
  taxId: '',
  variants: [],
};

function decimalToPaise(value) {
  const [whole = '0', fraction = ''] = String(value ?? '0').split('.');
  return (Number(whole) * 100) + Number(fraction.padEnd(2, '0').slice(0, 2));
}

function formatPaise(paise) {
  const whole = Math.floor(Math.abs(paise) / 100);
  const fraction = String(Math.abs(paise) % 100).padStart(2, '0');
  const formattedWhole = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(whole);
  return `${paise < 0 ? '-' : ''}₹${formattedWhole}.${fraction}`;
}

function formatMoney(value) {
  return formatPaise(decimalToPaise(value));
}

function useApiHeaders() {
  return useCallback(async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }, []);
}

function ProductsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === 'ADMIN';
  const getHeaders = useApiHeaders();
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchFilter(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const headers = await getHeaders();
      const response = await axios.get(`${API_BASE_URL}/products`, {
        params: {
          page,
          pageSize: PAGE_SIZE,
          ...(searchFilter ? { search: searchFilter } : {}),
          ...(type ? { type } : {}),
        },
        headers,
      });
      setProducts(response.data.data);
      setTotal(response.data.total);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to load products'
      );
    } finally {
      setLoading(false);
    }
  }, [getHeaders, page, refreshKey, searchFilter, type]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const setProductActive = async (product, isActive) => {
    setError('');
    try {
      await api.patch(`/products/${product.id}`, { isActive });
      setRefreshKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const deleteProduct = async () => {
    if (!productToDelete) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/products/${productToDelete.id}`);
      setProductToDelete(null);
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
        header: 'PRODUCT',
        render: (product) => (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Package className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-surface-text">{product.name}</p>
              <p className="text-[12px] text-surface-muted">{product.type}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'price',
        header: 'SALES PRICE',
        cellClassName: 'tabular-nums',
        render: (product) => formatMoney(product.salesPrice),
      },
      {
        key: 'cost',
        header: 'COST PRICE',
        cellClassName: 'tabular-nums',
        render: (product) => formatMoney(product.costPrice),
      },
      {
        key: 'margin',
        header: 'MARGIN',
        cellClassName: 'tabular-nums font-medium',
        render: (product) => formatPaise(
          decimalToPaise(product.salesPrice) - decimalToPaise(product.costPrice)
        ),
      },
      {
        key: 'tax',
        header: 'TAX',
        render: (product) => product.tax?.name || '—',
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (product) => (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
            product.isActive
              ? 'bg-status-success-soft text-status-success'
              : 'bg-status-neutral-soft text-status-neutral'
          }`}>
            {product.isActive ? 'Active' : 'Inactive'}
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
        render: (product) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Pencil}
              onClick={() => navigate(`/products/${product.id}/edit`)}
              aria-label={`Edit ${product.name}`}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProductActive(product, !product.isActive)}
            >
              {product.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={() => setProductToDelete(product)}
              aria-label={`Delete ${product.name}`}
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
        title="Products"
        subtitle="Manage products, variants, pricing, and tax assignments."
        actions={isAdmin && (
          <Button icon={Plus} onClick={() => navigate('/products/new')}>New product</Button>
        )}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" aria-hidden="true" />
          <Input
            aria-label="Search products"
            className="pl-9"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by product type"
          className="sm:max-w-56"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {PRODUCT_TYPES.map((productType) => (
            <option key={productType} value={productType}>{productType}</option>
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
            <Button variant="outline" size="sm" onClick={loadProducts}>Retry</Button>
          </div>
        </div>
      )}

      <Card padding={false}>
        <Table
          columns={columns}
          data={products}
          loading={loading}
          emptyMessage="No products match your filters."
          emptyActionLabel={isAdmin ? 'Create product' : undefined}
          onEmptyAction={isAdmin ? () => navigate('/products/new') : undefined}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </Card>

      <ConfirmDialog
        isOpen={!!productToDelete}
        onClose={() => !deleting && setProductToDelete(null)}
        onConfirm={deleteProduct}
        title="Delete product?"
        message={`${productToDelete?.name || 'This product'} will be permanently removed if it is not used by subscriptions or invoices. Otherwise, deactivate it instead.`}
        confirmLabel="Delete product"
        loading={deleting}
      />
    </div>
  );
}

function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const getHeaders = useApiHeaders();
  const editing = Boolean(id);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadForm() {
      setLoading(true);
      setError('');
      setLoadFailed(false);
      try {
        const headers = await getHeaders();
        const requests = [
          axios.get(`${API_BASE_URL}/taxes`, {
            params: { page: 1, pageSize: 100 },
            headers,
          }),
        ];
        if (editing) {
          requests.push(axios.get(`${API_BASE_URL}/products/${id}`, { headers }));
        }
        const [taxResponse, productResponse] = await Promise.all(requests);
        if (!active) return;

        const activeTaxes = taxResponse.data.data.filter((tax) => tax.isActive);
        setTaxes(activeTaxes);
        if (editing) {
          const product = productResponse.data.data;
          if (product.tax && !activeTaxes.some((tax) => tax.id === product.tax.id)) {
            setTaxes([...activeTaxes, product.tax]);
          }
          setForm({
            name: product.name,
            type: product.type,
            salesPrice: String(product.salesPrice),
            costPrice: String(product.costPrice),
            notes: product.notes || '',
            taxId: product.taxId || '',
            variants: product.variants.map((variant) => ({
              id: variant.id,
              attribute: variant.attribute,
              value: variant.value,
              extraPrice: String(variant.extraPrice),
            })),
          });
        }
      } catch (requestError) {
        if (active) {
          setLoadFailed(true);
          setError(
            requestError.response?.data?.error?.message
            || requestError.message
            || 'Unable to load product details'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadForm();
    return () => { active = false; };
  }, [editing, getHeaders, id, loadKey]);

  const updateVariant = (index, field, value) => {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, [field]: value } : variant
      )),
    }));
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name,
      type: form.type,
      salesPrice: Number(form.salesPrice),
      costPrice: Number(form.costPrice),
      notes: form.notes.trim() || null,
      taxId: form.taxId || null,
      variants: form.variants.map(({ attribute, value, extraPrice }) => ({
        attribute,
        value,
        extraPrice: Number(extraPrice),
      })),
    };

    try {
      if (editing) {
        await api.patch(`/products/${id}`, body);
      } else {
        await api.post('/products', body);
      }
      navigate('/products');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={editing ? 'Edit product' : 'New product'} />
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
        <PageHeader title="Edit product" />
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
        title={editing ? 'Edit product' : 'New product'}
        subtitle="Set product details, pricing, tax, and purchasable variants."
        breadcrumbs={<Link className="text-brand-link hover:underline" to="/products">Products</Link>}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-card bg-status-danger-soft px-4 py-3 text-[14px] text-status-danger"
        >
          {error}
        </div>
      )}

      <form onSubmit={saveProduct} className="space-y-6">
        <Card title="Product details" subtitle="Core information and pricing.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Product name"
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={160}
              required
            />
            <Select
              label="Product type"
              name="type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              required
            >
              {PRODUCT_TYPES.map((productType) => (
                <option key={productType} value={productType}>{productType}</option>
              ))}
            </Select>
            <Input
              label="Sales price (INR)"
              name="salesPrice"
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={form.salesPrice}
              onChange={(event) => setForm({ ...form, salesPrice: event.target.value })}
              required
            />
            <Input
              label="Cost price (INR)"
              name="costPrice"
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={form.costPrice}
              onChange={(event) => setForm({ ...form, costPrice: event.target.value })}
              required
            />
            <Select
              label="Tax"
              name="taxId"
              value={form.taxId}
              onChange={(event) => setForm({ ...form, taxId: event.target.value })}
            >
              <option value="">No tax</option>
              {taxes.map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name}{tax.isActive ? '' : ' (Inactive)'}
                </option>
              ))}
            </Select>
            <Textarea
              label="Notes"
              name="notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              maxLength={5000}
              rows={3}
            />
          </div>
        </Card>

        <Card
          title="Variants"
          subtitle="Add optional attributes and extra prices, such as Brand: Odoo (+₹560)."
          actions={(
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setForm({
                ...form,
                variants: [...form.variants, { ...EMPTY_VARIANT }],
              })}
            >
              Add variant
            </Button>
          )}
        >
          {form.variants.length === 0 ? (
            <p className="text-[14px] text-surface-muted">No variants added.</p>
          ) : (
            <div className="space-y-3">
              {form.variants.map((variant, index) => (
                <div
                  key={variant.id || index}
                  className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Input
                    label={index === 0 ? 'Attribute' : undefined}
                    value={variant.attribute}
                    onChange={(event) => updateVariant(index, 'attribute', event.target.value)}
                    placeholder="Brand"
                    maxLength={80}
                    required
                  />
                  <Input
                    label={index === 0 ? 'Value' : undefined}
                    value={variant.value}
                    onChange={(event) => updateVariant(index, 'value', event.target.value)}
                    placeholder="Odoo"
                    maxLength={120}
                    required
                  />
                  <Input
                    label={index === 0 ? 'Extra price (INR)' : undefined}
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    value={variant.extraPrice}
                    onChange={(event) => updateVariant(index, 'extraPrice', event.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={Trash2}
                    aria-label={`Remove variant ${index + 1}`}
                    onClick={() => setForm({
                      ...form,
                      variants: form.variants.filter((_, variantIndex) => variantIndex !== index),
                    })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/products')} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export { ProductsPage, ProductFormPage };
