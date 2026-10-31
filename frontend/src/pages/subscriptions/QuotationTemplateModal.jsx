import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Textarea } from '../../components/Textarea';
import { Plus, Trash2, Layers } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const QuotationTemplateModal = ({
  isOpen,
  onClose,
  templateId = null,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    planId: '',
    validityDays: 30,
    notes: '',
    isActive: true,
  });

  const [lines, setLines] = useState([]);

  // Load plans and products on open
  useEffect(() => {
    if (!isOpen) return;

    const loadLookups = async () => {
      try {
        setLoading(true);
        // Load available plans
        const plansRes = await api.get('/plans/available').catch(async () => {
          // Fallback if available endpoint isn't up yet
          return api.get('/plans');
        });
        const plansList = Array.isArray(plansRes)
          ? plansRes
          : plansRes?.items || plansRes?.data || [];
        setPlans(plansList);

        // Load active products with variants
        const productsRes = await api.get('/products');
        const productsList = Array.isArray(productsRes)
          ? productsRes
          : productsRes?.items || productsRes?.data || [];
        setProducts(productsList);

        // If editing, load template details
        if (templateId) {
          const res = await api.get(`/quotation-templates/${templateId}`);
          const tmpl = res?.data || res;
          setFormData({
            name: tmpl.name || '',
            planId: tmpl.plan_id || '',
            validityDays: tmpl.validity_days || 30,
            notes: tmpl.notes || '',
            isActive: tmpl.is_active ?? true,
          });

          if (tmpl.lines && tmpl.lines.length > 0) {
            setLines(
              tmpl.lines.map((l) => ({
                id: l.id || Math.random().toString(),
                productId: l.product_id,
                variantId: l.variant_id || '',
                quantity: l.quantity || 1,
              }))
            );
          } else {
            setLines([]);
          }
        } else {
          // Reset for new template
          setFormData({
            name: '',
            planId: plansList[0]?.id || '',
            validityDays: 30,
            notes: '',
            isActive: true,
          });
          setLines([]);
        }
      } catch (err) {
        toast.error('Failed to load template data');
      } finally {
        setLoading(false);
      }
    };

    loadLookups();
  }, [isOpen, templateId]);

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
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'productId') {
        // Reset variant if product changes
        updated[index].variantId = '';
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!formData.planId) {
      toast.error('Please select a plan');
      return;
    }

    // Format lines
    const payloadLines = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        variantId: l.variantId || null,
        quantity: parseInt(l.quantity, 10) || 1,
      }));

    const payload = {
      name: formData.name.trim(),
      planId: formData.planId,
      validityDays: parseInt(formData.validityDays, 10) || 30,
      notes: formData.notes?.trim() || null,
      isActive: formData.isActive,
      lines: payloadLines,
    };

    try {
      setSubmitting(true);
      if (templateId) {
        await api.patch(`/quotation-templates/${templateId}`, payload);
        toast.success('Quotation template updated');
      } else {
        await api.post('/quotation-templates', payload);
        toast.success('Quotation template created');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      // toast error handled by api interceptor
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to get variants for a chosen product
  const getProductVariants = (productId) => {
    const prod = products.find((p) => p.id === productId);
    return prod?.variants || [];
  };

  // Compute estimate totals
  const computeEstimate = () => {
    let subtotal = 0;
    lines.forEach((l) => {
      const prod = products.find((p) => p.id === l.productId);
      if (prod) {
        let price = parseFloat(prod.sales_price || prod.salesPrice || 0);
        if (l.variantId) {
          const variant = (prod.variants || []).find((v) => v.id === l.variantId);
          if (variant) {
            price += parseFloat(variant.extra_price || variant.extraPrice || 0);
          }
        }
        subtotal += price * (parseInt(l.quantity, 10) || 1);
      }
    });
    return subtotal;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={templateId ? 'Edit Quotation Template' : 'New Quotation Template'}
      maxWidth="max-w-3xl"
    >
      {loading ? (
        <div className="py-12 flex justify-center text-surface-muted text-[14px]">
          Loading details...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Template Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Standard Business Onboarding"
              required
            />

            <Select
              label="Default Plan *"
              value={formData.planId}
              onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              options={[
                { value: '', label: 'Select a plan' },
                ...plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.billing_period || p.billingPeriod} - ₹${p.price})`,
                })),
              ]}
              required
            />

            <Input
              label="Quotation Validity (Days) *"
              type="number"
              min="1"
              value={formData.validityDays}
              onChange={(e) =>
                setFormData({ ...formData, validityDays: parseInt(e.target.value, 10) || 1 })
              }
              helperText="Quotation expiry will default to today + validity days"
              required
            />

            <div className="flex flex-col justify-center pt-2">
              <label className="text-[12px] font-medium text-surface-muted mb-2">Status</label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-surface-border text-brand focus:ring-brand w-4 h-4"
                />
                <span className="text-[14px] text-surface-text">
                  Active (available when creating subscriptions)
                </span>
              </label>
            </div>
          </div>

          <Textarea
            label="Internal Notes"
            rows={2}
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Special onboarding terms or setup notes..."
          />

          {/* Lines Table */}
          <div className="border border-surface-border rounded-xl p-4 bg-surface-canvas/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" />
                <h4 className="text-[14px] font-semibold text-surface-text">
                  Prefilled Product Lines ({lines.length})
                </h4>
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

            {lines.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-surface-muted bg-white rounded-lg border border-dashed border-surface-border">
                No product lines attached. Click "+ Add Product Line" to attach default products.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const variants = getProductVariants(line.productId);
                  return (
                    <div
                      key={line.id || idx}
                      className="flex flex-col md:flex-row items-center gap-3 bg-white p-3 rounded-lg border border-surface-border"
                    >
                      <div className="flex-1 w-full">
                        <select
                          className="w-full text-[13px] px-3 py-1.5 rounded-[8px] border border-surface-border focus:ring-2 focus:ring-brand"
                          value={line.productId}
                          onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                        >
                          <option value="">Select Product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{p.sales_price || p.salesPrice})
                            </option>
                          ))}
                        </select>
                      </div>

                      {variants.length > 0 && (
                        <div className="w-full md:w-48">
                          <select
                            className="w-full text-[13px] px-3 py-1.5 rounded-[8px] border border-surface-border focus:ring-2 focus:ring-brand"
                            value={line.variantId || ''}
                            onChange={(e) => handleLineChange(idx, 'variantId', e.target.value)}
                          >
                            <option value="">Standard (No variant)</option>
                            {variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.attribute}: {v.value} (+₹{v.extra_price || v.extraPrice})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="w-full md:w-24">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          className="w-full text-[13px] px-3 py-1.5 rounded-[8px] border border-surface-border focus:ring-2 focus:ring-brand text-center"
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                          }
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1.5 text-surface-muted hover:text-status-danger hover:bg-status-danger-soft rounded-lg transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-2 text-[13px] text-surface-muted">
                  Estimated Lines Total:{' '}
                  <span className="font-semibold text-surface-text ml-2">
                    ₹{computeEstimate().toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {templateId ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default QuotationTemplateModal;

