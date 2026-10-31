import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { PathStepper } from '../../components/PathStepper';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  ArrowLeft,
  Repeat,
  Calendar,
  User,
  Building,
  CreditCard,
  Layers,
  History,
  FileText,
  Clock,
  Play,
  Pause,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const LIFECYCLE_STEPS = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

export const SubscriptionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('lines');
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
      toast.success('Subscription status updated successfully');
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
        <p className="text-[14px]">Loading subscription details...</p>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="py-16 text-center">
        <p className="text-[16px] text-surface-muted mb-4">Subscription not found.</p>
        <Button variant="outline" onClick={() => navigate('/subscriptions')}>
          Back to Subscriptions
        </Button>
      </div>
    );
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
  const history = subscription.history || [];
  const totals = subscription.totals || { subtotal: '0.00', taxTotal: '0.00', total: '0.00' };

  // Compute next action label for PathStepper
  let nextActionLabel = null;
  let onNextAction = null;
  if (subscription.status === 'DRAFT') {
    nextActionLabel = 'Send Quotation';
    onNextAction = () => handleAction('send-quotation');
  } else if (subscription.status === 'QUOTATION') {
    nextActionLabel = 'Confirm Subscription';
    onNextAction = () => handleAction('confirm');
  } else if (subscription.status === 'CONFIRMED') {
    nextActionLabel = 'Activate Subscription';
    onNextAction = () => handleAction('activate');
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/subscriptions')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Subscriptions
        </Button>
      </div>

      {/* Record Header Card */}
      <div className="bg-white rounded-[16px] border border-surface-border p-6 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-surface-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center shadow-sm">
              <Repeat className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-brand uppercase tracking-wider">
                Subscription Contract
              </div>
              <h1 className="text-[26px] font-bold text-surface-text tabular-nums leading-tight">
                {subscription.number}
              </h1>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {getStatusBadge(subscription.status, subscription.is_paused)}

            {/* Dynamic Lifecycle Action Buttons */}
            {subscription.status === 'DRAFT' && (
              <>
                <Button
                  size="sm"
                  icon={Send}
                  loading={actionLoading}
                  onClick={() => handleAction('send-quotation')}
                >
                  Send Quotation
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={actionLoading}
                  className="text-status-danger border-status-danger/30 hover:bg-status-danger-soft"
                  onClick={() =>
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Discard Draft Subscription',
                      message: `Are you sure you want to discard and close subscription ${subscription.number}?`,
                      action: () => handleAction('close'),
                      variant: 'danger',
                    })
                  }
                >
                  Discard
                </Button>
              </>
            )}

            {subscription.status === 'QUOTATION' && (
              <>
                <Button
                  size="sm"
                  icon={CheckCircle2}
                  loading={actionLoading}
                  onClick={() => handleAction('confirm')}
                >
                  Confirm Contract
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={actionLoading}
                  className="text-status-danger border-status-danger/30 hover:bg-status-danger-soft"
                  onClick={() =>
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Reject / Close Quotation',
                      message: `Are you sure you want to reject and close quotation ${subscription.number}?`,
                      action: () => handleAction('close'),
                      variant: 'danger',
                    })
                  }
                >
                  Reject
                </Button>
              </>
            )}

            {subscription.status === 'CONFIRMED' && (
              <Button
                size="sm"
                icon={Play}
                loading={actionLoading}
                onClick={() => handleAction('activate')}
              >
                Activate Subscription
              </Button>
            )}

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
                      onClick={() => handleAction('pause')}
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
                        title: 'Close Subscription Early',
                        message: `Are you sure you want to terminate subscription ${subscription.number} early? This plan permits early closure.`,
                        action: () => handleAction('close'),
                        variant: 'danger',
                      })
                    }
                  >
                    Close Early
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
                        message: `Renew subscription ${subscription.number} for another term? Expiry date will be extended by the plan period.`,
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
                    message: `Reopen closed subscription ${subscription.number} back to Active status and extend the contract term?`,
                    action: () => handleAction('renew'),
                    variant: 'primary',
                  })
                }
              >
                Renew Contract
              </Button>
            )}
          </div>
        </div>

        {/* Key-Fields Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 text-[13px]">
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Customer</span>
            <span className="font-semibold text-surface-text">{subscription.customer_name}</span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Billing Plan</span>
            <span className="font-semibold text-surface-text">{subscription.plan_name}</span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Term Period</span>
            <span className="font-medium text-surface-text">
              {subscription.start_date}{' '}
              {subscription.expiry_date ? `to ${subscription.expiry_date}` : '(Open)'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Next Billing</span>
            <span className="font-semibold text-surface-text tabular-nums">
              {subscription.next_billing_date || '—'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-surface-muted block font-medium">Payment Terms</span>
            <span className="font-medium text-surface-text">{subscription.payment_terms}</span>
          </div>
        </div>
      </div>

      {/* Stepper Card */}
      <PathStepper
        steps={LIFECYCLE_STEPS}
        currentStep={
          subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1).toLowerCase()
        }
        actionButtonLabel={nextActionLabel}
        onActionClick={onNextAction}
      />

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Tabs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-[16px] border border-surface-border shadow-card overflow-hidden">
            {/* Card Tabs Bar */}
            <div className="flex items-center gap-6 px-6 pt-4 border-b border-surface-border">
              <button
                onClick={() => setActiveTab('lines')}
                className={`pb-3 text-[14px] font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-2 ${
                  activeTab === 'lines'
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-surface-muted hover:text-surface-text'
                }`}
              >
                <Layers className="w-4 h-4" />
                Line Items ({lines.length})
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`pb-3 text-[14px] font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-2 ${
                  activeTab === 'history'
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-surface-muted hover:text-surface-text'
                }`}
              >
                <History className="w-4 h-4" />
                Status Timeline ({history.length})
              </button>

              <button
                onClick={() => setActiveTab('notes')}
                className={`pb-3 text-[14px] font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-2 ${
                  activeTab === 'notes'
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-surface-muted hover:text-surface-text'
                }`}
              >
                <FileText className="w-4 h-4" />
                Contract Notes
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6">
              {activeTab === 'lines' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-surface-border text-surface-muted font-semibold text-[11px] uppercase tracking-wider">
                        <th className="pb-3">Description</th>
                        <th className="pb-3 text-center">Qty</th>
                        <th className="pb-3 text-right">Unit Price</th>
                        <th className="pb-3 text-right">Tax Snapshot</th>
                        <th className="pb-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {lines.map((l) => (
                        <tr
                          key={l.id}
                          className="h-12 hover:bg-surface-canvas/50 transition-colors"
                        >
                          <td className="py-3 font-medium text-surface-text">
                            <div>{l.description}</div>
                            {l.product_type && (
                              <span className="text-[11px] text-surface-muted">
                                {l.product_type}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-center tabular-nums font-semibold">
                            {l.quantity}
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            ₹{parseFloat(l.unit_price).toFixed(2)}
                          </td>
                          <td className="py-3 text-right tabular-nums text-surface-muted">
                            {l.tax_type === 'PERCENT' ? `${l.tax_rate}%` : `Fixed ₹${l.tax_rate}`}
                            <span className="text-[11px] block">
                              (+₹{parseFloat(l.taxAmount || 0).toFixed(2)})
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-surface-text tabular-nums">
                            ₹{parseFloat(l.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4">
                  {history.length === 0 ? (
                    <p className="text-surface-muted text-[13px]">No timeline events recorded.</p>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-border">
                      {history.map((event, idx) => (
                        <div key={event.id || idx} className="relative">
                          <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full bg-brand border-2 border-white shadow-sm flex items-center justify-center"></div>
                          <div>
                            <div className="text-[13px] font-semibold text-surface-text">
                              Status changed to <span className="text-brand">{event.to_status}</span>
                              {event.action && (
                                <span className="text-surface-muted font-normal text-[12px] ml-1">
                                  via action "{event.action}"
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-surface-muted flex items-center gap-2 mt-0.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{new Date(event.changed_at).toLocaleString()}</span>
                              {event.changed_by_name && (
                                <span>
                                  • by {event.changed_by_name} ({event.changed_by_role})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'notes' && (
                <div>
                  {subscription.notes ? (
                    <div className="p-4 bg-surface-canvas rounded-xl text-[13px] text-surface-text whitespace-pre-wrap">
                      {subscription.notes}
                    </div>
                  ) : (
                    <p className="text-surface-muted text-[13px] italic">
                      No internal notes recorded for this contract.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 col): Financials & Metadata */}
        <div className="space-y-6">
          {/* Financial Summary Card */}
          <Card title="Financial Summary">
            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between text-surface-muted">
                <span>Subtotal (Net)</span>
                <span className="font-semibold text-surface-text tabular-nums">
                  ₹{parseFloat(totals.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-surface-muted">
                <span>Estimated Tax Total</span>
                <span className="font-semibold text-surface-text tabular-nums">
                  ₹{parseFloat(totals.taxTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-surface-border pt-3 flex justify-between text-[16px] font-bold text-surface-text">
                <span>Contract Total</span>
                <span className="text-brand tabular-nums">
                  ₹{parseFloat(totals.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </Card>

          {/* Customer Card */}
          <Card title="Customer">
            <div className="space-y-2 text-[13px]">
              <div className="font-semibold text-surface-text flex items-center gap-2">
                <User className="w-4 h-4 text-brand" />
                {subscription.customer_name}
              </div>
              {subscription.customer_email && (
                <div className="text-surface-muted">{subscription.customer_email}</div>
              )}
              {subscription.customer_company && (
                <div className="text-surface-muted flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5" />
                  {subscription.customer_company}
                </div>
              )}
            </div>
          </Card>

          {/* Plan Rules Card */}
          <Card title="Plan Rules & Flags">
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between py-1 border-b border-surface-border">
                <span className="text-surface-muted">Auto-close at expiry</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_auto_close ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-border">
                <span className="text-surface-muted">Closable early</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_closable ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-border">
                <span className="text-surface-muted">Pausable</span>
                <span className="font-medium text-surface-text">
                  {subscription.plan_pausable ? 'Yes' : 'No'}
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

      {/* Confirm Action Dialog */}
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

export default SubscriptionDetailPage;
