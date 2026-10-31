import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Textarea } from '../../components/Textarea';
import { Card } from '../../components/Card';
import { Plus, Trash2, ArrowLeft, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const SubscriptionCreatePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Lookups
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [products, setProducts] = useState([]);

  // Form
  const [formData, setFormData] = useState({
    customerId: '',
    templateId: '',
    planId: '',
    startDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    paymentTerms: 'NET_15',
    notes: '',
  });

  const [lines, setLines] = useState([]);

  // Load lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        setLoading(true);

        const [custRes, planRes, tmplRes, prodRes] = await Promise.all([
          api.get('/customers').catch(() => []),
          api.get('/plans/available').catch(async () => api.get('/plans').catch(() => [])),
          api.get('/quotation-templates?isActive=true').catch(() => []),
          api.get('/products').catch(() => []),
        ]);

        const custList = Array.isArray(custRes) ? custRes : custRes?.data || custRes?.items || [];
        const planList = Array.isArray(planRes) ? planRes : planRes?.data || planRes?.items || [];
        const tmplList = Array.isArray(tmplRes) ? tmplRes : tmplRes?.data || tmplRes?.items || [];
        const prodList = Array.isArray(prodRes) ? prodRes : prodRes?.data || prodRes?.items || [];

        setCustomers(custList);
        setPlans(planList);
        setTemplates(tmplList);
        setProducts(prodList);

        if (custList.length > 0) {
          setFormData((prev) => ({ ...prev, customerId: custList[0].id }));
        }
        if (planList.length > 0) {
          setFormData((prev) => ({ ...prev, planId: planList[0].id }));
        }
        if (prodList.length > 0) {
          setLines([
            {
              id: Math.random().toString(),
              productId: prodList[0].id,
              variantId: '',
              quantity: 1,
            },
          ]);
        }
      } catch (err) {
        toast.error('Failed to load form options');
      } finally {
        setLoading(false);
      }
    };

    loadLookups();
  }, []);

  // When a template is selected, prefill plan and lines
  const handleTemplateChange = async (templateId) => {
    setFormData((prev) => ({ ...prev, templateId }));
    if (!templateId) return;

    try {
      const res = await api.get(`/quotation-templates/${templateId}`);
      const tmpl = res?.data || res;
      if (tmpl) {
        setFormData((prev) => ({
          ...prev,
          planId: tmpl.plan_id || prev.planId,
          notes: tmpl.notes || prev.notes,
        }));

        if (tmpl.lines && tmpl.lines.length > 0) {
          setLines(
            tmpl.lines.map((l) => ({
              id: Math.random().toString(),
              productId: l.product_id,
              variantId: l.variant_id || '',
              quantity: l.quantity || 1,
            }))
          );
          toast.success(`Prefilled from template "${tmpl.name}"`);
        }
      }
    } catch (err) {
      toast.error('Failed to load template lines');
    }
  };

  const handleAddLine = () => {
    const defaultProduct = products[0];
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        productId: defaultProduct?.id || '',
        variantId: '',
        quantity: 1,
      },
    ]);
  };

  const handleRemoveLine = (index) => {
    if (lines.length <= 1) {
      toast.error('A subscription must have at least one line item');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'productId') {
        updated[index].variantId = '';
      }
      return updated;
    });
  };

  const getProductVariants = (productId) => {
    const prod = products.find((p) => p.id === productId);
    return prod?.variants || [];
  };

  // Selected plan
  const selectedPlan = plans.find((p) => p.id === formData.planId);
  const minQtyRequired = selectedPlan?.min_qty || 1;
  const totalQuantity = lines.reduce((sum, l) => sum + (parseInt(l.quantity, 10) || 0), 0);
  const meetsMinQty = totalQuantity >= minQtyRequired;

  // Compute live estimate
  const computeEstimate = () => {
    let subtotal = 0;
    lines.forEach((l) => {
      const prod = products.find((p) => p.id === l.productId);
      if (prod) {
        let price = parseFloat(prod.sales_price || prod.salesPrice || 0);
        if (l.variantId) {
          const v = (prod.variants || []).find((varItem) => varItem.id === l.variantId);
          if (v) price += parseFloat(v.extra_price || v.extraPrice || 0);
        }
        subtotal += price * (parseInt(l.quantity, 10) || 1);
      }
    });
    return subtotal;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (!formData.planId) {
      toast.error('Please select a billing plan');
      return;
    }
    if (lines.length === 0) {
      toast.error('At least one line item is required');
      return;
    }
    if (!meetsMinQty) {
      toast.error(`Total quantity must be at least ${minQtyRequired} for the chosen plan`);
      return;
    }

    const payload = {
      customerId: formData.customerId,
      planId: formData.planId,
      templateId: formData.templateId || null,
      startDate: formData.startDate,
      expiryDate: formData.expiryDate || null,
      paymentTerms: formData.paymentTerms,
      notes: formData.notes?.trim() || null,
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId || null,
        quantity: parseInt(l.quantity, 10) || 1,
      })),
    };

    try {
      setSubmitting(true);
      const res = await api.post('/subscriptions', payload);
      toast.success('Subscription created successfully');
      const createdId = res?.id || res?.data?.id;
      if (createdId) {
        navigate(`/subscriptions/${createdId}`);
      } else {
        navigate('/subscriptions');
      }
    } catch (err) {
      // toast error handled by api interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/subscriptions')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Subscriptions
        </Button>
      </div>

      <PageHeader
        title="Create Subscription"
        subtitle="Configure recurring terms, customer billing agreement, and snapshot product line items."
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Contract & Customer Details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Customer *"
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                options={[
                  { value: '', label: 'Select customer' },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} ${c.company ? `(${c.company})` : ''}`,
                  })),
                ]}
                required
              />

              <Select
                label="Quotation Template (Optional)"
                value={formData.templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                options={[
                  { value: '', label: 'None (Configure manually)' },
                  ...templates.map((t) => ({
                    value: t.id,
                    label: `${t.name} (${t.plan_name || 'Plan'})`,
                  })),
                ]}
              />

              <Select
                label="Billing Plan *"
                value={formData.planId}
                onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                options={[
                  { value: '', label: 'Select billing plan' },
                  ...plans.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.billing_period || p.billingPeriod} • ₹${p.price})`,
                  })),
                ]}
                required
              />

              <Select
                label="Payment Terms"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                options={[
                  { value: 'IMMEDIATE', label: 'Immediate (Due upon receipt)' },
                  { value: 'NET_15', label: 'Net 15 Days' },
                  { value: 'NET_30', label: 'Net 30 Days' },
                  { value: 'NET_60', label: 'Net 60 Days' },
                ]}
              />

              <Input
                label="Start Date *"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />

              <Input
                label="Expiry Date (Optional)"
                type="date"
                min={formData.startDate}
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                helperText="Leave empty for open-ended ongoing subscription"
              />
            </div>

            <div className="mt-4">
              <Textarea
                label="Internal Notes"
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Custom terms, quotation context or customer instructions..."
              />
            </div>
          </Card>

          {/* Product Lines Section */}
          <Card
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-brand" />
                  <span>Product Lines ({lines.length})</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={handleAddLine}
                >
                  Add Product Line
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const variants = getProductVariants(line.productId);
                const selectedProd = products.find((p) => p.id === line.productId);
                let unitPrice = parseFloat(selectedProd?.sales_price || 0);
                if (line.variantId) {
                  const vr = variants.find((v) => v.id === line.variantId);
                  if (vr) unitPrice += parseFloat(vr.extra_price || 0);
                }
                const lineTotal = unitPrice * (parseInt(line.quantity, 10) || 1);

                return (
                  <div
                    key={line.id || idx}
                    className="p-3.5 bg-surface-canvas/40 rounded-xl border border-surface-border flex flex-col md:flex-row items-center gap-3"
                  >
                    <div className="flex-1 w-full">
                      <label className="text-[11px] font-medium text-surface-muted block mb-1">
                        Product
                      </label>
                      <select
                        className="w-full text-[13px] px-3 py-1.5 rounded-[8px] bg-white border border-surface-border focus:ring-2 focus:ring-brand"
                        value={line.productId}
                        onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (₹{p.sales_price})
                          </option>
                        ))}
                      </select>
                    </div>

                    {variants.length > 0 && (
                      <div className="w-full md:w-48">
                        <label className="text-[11px] font-medium text-surface-muted block mb-1">
                          Variant
                        </label>
                        <select
                          className="w-full text-[13px] px-3 py-1.5 rounded-[8px] bg-white border border-surface-border focus:ring-2 focus:ring-brand"
                          value={line.variantId || ''}
                          onChange={(e) => handleLineChange(idx, 'variantId', e.target.value)}
                        >
                          <option value="">Base (No variant)</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.attribute}: {v.value} (+₹{v.extra_price})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="w-full md:w-20">
                      <label className="text-[11px] font-medium text-surface-muted block mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full text-[13px] px-2 py-1.5 rounded-[8px] bg-white border border-surface-border focus:ring-2 focus:ring-brand text-center"
                        value={line.quantity}
                        onChange={(e) =>
                          handleLineChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                        }
                      />
                    </div>

                    <div className="w-full md:w-28 text-right">
                      <label className="text-[11px] font-medium text-surface-muted block mb-1">
                        Amount
                      </label>
                      <div className="text-[13px] font-semibold text-surface-text py-1.5 tabular-nums">
                        ₹{lineTotal.toFixed(2)}
                      </div>
                    </div>

                    <div className="pt-5">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1.5 text-surface-muted hover:text-status-danger hover:bg-status-danger-soft rounded-lg transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Summary Card (1 col) */}
        <div className="space-y-6">
          <Card title="Summary & Validation">
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-surface-canvas text-[13px] space-y-1.5">
                <div className="flex justify-between text-surface-muted">
                  <span>Selected Plan</span>
                  <span className="font-semibold text-surface-text">
                    {selectedPlan?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between text-surface-muted">
                  <span>Billing Period</span>
                  <span className="font-medium text-surface-text">
                    {selectedPlan?.billing_period || '—'}
                  </span>
                </div>
                <div className="flex justify-between text-surface-muted">
                  <span>Minimum Quantity</span>
                  <span className="font-medium tabular-nums text-surface-text">
                    {minQtyRequired} unit{minQtyRequired > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Min Qty Check */}
              <div
                className={`p-3 rounded-lg flex items-center gap-2.5 text-[13px] ${
                  meetsMinQty
                    ? 'bg-status-success-soft text-status-success'
                    : 'bg-status-warning-soft text-status-warning'
                }`}
              >
                {meetsMinQty ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Total line quantity ({totalQuantity}) meets plan requirement</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      Requires {minQtyRequired} total units (current: {totalQuantity})
                    </span>
                  </>
                )}
              </div>

              {/* Price Calculation Box */}
              <div className="border-t border-surface-border pt-4 space-y-2">
                <div className="flex justify-between text-[14px] text-surface-muted">
                  <span>Estimated Subtotal</span>
                  <span className="font-semibold text-surface-text tabular-nums">
                    ₹{computeEstimate().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[11px] text-surface-muted italic">
                  * Final taxes and snapshots will be computed upon creation. Initial status will be DRAFT.
                </div>
              </div>

              <div className="pt-4 border-t border-surface-border space-y-3">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={submitting}
                  disabled={!meetsMinQty || submitting}
                >
                  Create Subscription (Draft)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/subscriptions')}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
};

export default SubscriptionCreatePage;
