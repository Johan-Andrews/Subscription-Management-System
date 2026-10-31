import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { Badge } from '../../../components/Badge';
import { Card } from '../../../components/Card';
import { PathStepper } from '../../../components/PathStepper';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import {
  ArrowLeft,
  Repeat,
  Calendar,
  CreditCard,
  Layers,
  Pause,
  Play,
  RefreshCw,
  XCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const LIFECYCLE_STEPS = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

export const PortalSubscriptionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    action: null,
    variant: 'primary',
  });

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/subscriptions/${id}`);
      const data = res?.data || res;
      setSubscription(data);
    } catch (err) {
      toast.error('Failed to load subscription details');
      navigate('/portal/subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [id]);

  const handleAction = async (actionEndpoint) => {
    try {
      setActionLoading(true);
      await api.post(`/subscriptions/${id}/${actionEndpoint}`);
      toast.success('Subscription updated successfully');
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      const res = await api.get(`/subscriptions/${id}`);
      setSubscription(res?.data || res);
    } catch (err) {
      // toast error handled by api interceptor
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-surface-muted">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-[14px]">Loading subscription...</p>
      </div>
    );
  }

  if (!subscription) {
    return null;
  }

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

  const lines = subscription.lines || [];
  const totals = subscription.totals || { subtotal: '0.00', taxTotal: '0.00', total: '0.00' };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/portal/subscriptions')}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to My Subscriptions
        </Button>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-[16px] border border-surface-border p-6 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-surface-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shadow-sm">
              <Repeat className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-brand uppercase tracking-wider">
                My Subscription
              </div>
              <h1 className="text-[24px] font-bold text-surface-text tabular-nums leading-tight">
                {subscription.number} • {subscription.plan_name}
              </h1>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {getStatusBadge(subscription.status, subscription.is_paused)}

            {/* Allowed Customer Action Buttons */}
            {subscription.status === 'ACTIVE' && (
              <>
                {subscription.is_paused ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={Play}
                    loading={actionLoading}
                    onClick={() => handleAction('resume')}
                  >
                    Resume Subscription
                  </Button>
                ) : (
                  subscription.plan_pausable && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Pause}
                      loading={actionLoading}
                      onClick={() =>
                        setConfirmDialog({
                          isOpen: true,
                          title: 'Pause Subscription',
                          message: `Are you sure you want to pause subscription ${subscription.number}? Billing will be halted while paused.`,
                          action: () => handleAction('pause'),
                          variant: 'primary',
                        })
                      }
                    >
                      Pause
                    </Button>
                  )
                )}

                {subscription.plan_closable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-status-danger border-status-danger/30 hover:bg-status-danger-soft"
                    loading={actionLoading}
                    onClick={() =>
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Cancel Subscription',
                        message: `Are you sure you want to cancel subscription ${subscription.number}?`,
                        action: () => handleAction('close'),
                        variant: 'danger',
                      })
                    }
                  >
                    Cancel Plan
                  </Button>
                )}

                {subscription.plan_renewable && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={RefreshCw}
                    loading={actionLoading}
                    onClick={() =>
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Renew Subscription',
                        message: `Renew subscription ${subscription.number} for another term?`,
                        action: () => handleAction('renew'),
                        variant: 'primary',
                      })
                    }
                  >
                    Renew
                  </Button>
                )}
              </>
            )}

            {subscription.status === 'CLOSED' && subscription.plan_renewable && (
              <Button
                size="sm"
                icon={RefreshCw}
                loading={actionLoading}
                onClick={() =>
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Reopen & Renew Subscription',
                    message: `Would you like to renew and reactivate subscription ${subscription.number}?`,
                    action: () => handleAction('renew'),
                    variant: 'primary',
                  })
                }
              >
                Renew Subscription
              </Button>
            )}
          </div>
        </div>

        {/* Key Fields */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-[13px]">
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Billing Period</span>
            <span className="font-semibold text-surface-text">
              {subscription.plan_billing_period}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Next Billing Date</span>
            <span className="font-semibold text-brand tabular-nums">
              {subscription.next_billing_date || '—'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Term Duration</span>
            <span className="font-medium text-surface-text">
              {subscription.start_date}{' '}
              {subscription.expiry_date ? `to ${subscription.expiry_date}` : '(Ongoing)'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Payment Terms</span>
            <span className="font-medium text-surface-text">{subscription.payment_terms}</span>
          </div>
        </div>
      </div>

      {/* Lifecycle Progress Stepper */}
      <PathStepper
        steps={LIFECYCLE_STEPS}
        currentStep={
          subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1).toLowerCase()
        }
      />

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Line items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-[16px] border border-surface-border p-6 shadow-card">
            <h3 className="font-semibold text-surface-text text-[15px] mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <span>Subscription Line Items ({lines.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-surface-border text-surface-muted font-semibold text-[11px] uppercase tracking-wider">
                    <th className="pb-3">Product Item</th>
                    <th className="pb-3 text-center">Qty</th>
                    <th className="pb-3 text-right">Unit Price</th>
                    <th className="pb-3 text-right">Tax</th>
                    <th className="pb-3 text-right">Line Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {lines.map((l) => (
                    <tr key={l.id} className="h-12">
                      <td className="py-3 font-medium text-surface-text">
                        {l.description}
                      </td>
                      <td className="py-3 text-center tabular-nums font-semibold">{l.quantity}</td>
                      <td className="py-3 text-right tabular-nums">
                        ₹{parseFloat(l.unit_price).toFixed(2)}
                      </td>
                      <td className="py-3 text-right tabular-nums text-surface-muted">
                        ₹{parseFloat(l.taxAmount || 0).toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-bold text-surface-text tabular-nums">
                        ₹{parseFloat(l.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (1 col): Summary & Plan Rules */}
        <div className="space-y-6">
          <Card title="Billing Summary">
            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between text-surface-muted">
                <span>Subtotal</span>
                <span className="font-semibold text-surface-text tabular-nums">
                  ₹{parseFloat(totals.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-surface-muted">
                <span>Estimated Tax</span>
                <span className="font-semibold text-surface-text tabular-nums">
                  ₹{parseFloat(totals.taxTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-surface-border pt-3 flex justify-between text-[16px] font-bold text-surface-text">
                <span>Recurring Total</span>
                <span className="text-brand tabular-nums">
                  ₹{parseFloat(totals.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Plan Privileges">
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between py-1 border-b border-surface-border">
                <span className="text-surface-muted">Pausable anytime</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_pausable ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-border">
                <span className="text-surface-muted">Early cancellation</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_closable ? 'Allowed' : 'Not Allowed'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-surface-muted">Renewable</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_renewable ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.action}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmVariant={confirmDialog.variant}
        loading={actionLoading}
      />
    </div>
  );
};

export default PortalSubscriptionDetailPage;

