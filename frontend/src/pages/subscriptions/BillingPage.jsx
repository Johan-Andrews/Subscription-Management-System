import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Table } from '../../components/Table';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { Pagination } from '../../components/Pagination';
import { Play, RotateCw, CheckCircle2, AlertTriangle, FileText, Clock, Zap } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const BillingPage = () => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/billing/runs', {
        params: { page, pageSize },
      });
      if (Array.isArray(res)) {
        setRuns(res);
        setTotal(res.length);
      } else if (res?.data && Array.isArray(res.data)) {
        setRuns(res.data);
        setTotal(res.total || res.data.length);
      } else if (res?.items && Array.isArray(res.items)) {
        setRuns(res.items);
        setTotal(res.total || res.items.length);
      } else {
        setRuns([]);
        setTotal(0);
      }
    } catch (err) {
      toast.error('Failed to load billing run history');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleRunBilling = async () => {
    try {
      setRunning(true);
      const res = await api.post('/billing/run');
      const data = res?.data || res;
      toast.success(
        `${data.invoicesCreated || 0} invoices created, ${data.skippedExisting || 0} already billed`
      );
      fetchRuns();
    } catch (err) {
      // toast error handled by api interceptor
    } finally {
      setRunning(false);
    }
  };

  const lastRun = runs[0] || null;

  const columns = [
    {
      header: 'Run ID & Trigger',
      key: 'id',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              row.triggered_by === 'CRON'
                ? 'bg-purple-50 text-purple-600'
                : 'bg-brand-soft text-brand'
            }`}
          >
            {row.triggered_by === 'CRON' ? <Clock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-semibold text-surface-text tabular-nums text-[13px]">
              {row.id.substring(0, 8)}...
            </div>
            <div className="text-[11px] text-surface-muted">
              {row.triggered_by === 'CRON'
                ? 'Scheduled Cron'
                : row.triggered_user_name
                ? `Manual (${row.triggered_user_name})`
                : 'Manual Run'}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Execution Time',
      key: 'started_at',
      render: (row) => (
        <div>
          <div className="text-surface-text font-medium text-[13px]">
            {new Date(row.started_at).toLocaleDateString()} {new Date(row.started_at).toLocaleTimeString()}
          </div>
          <div className="text-[11px] text-surface-muted tabular-nums">
            Duration: {row.duration_seconds !== null ? `${row.duration_seconds}s` : 'In progress'}
          </div>
        </div>
      ),
    },
    {
      header: 'Due Subscriptions',
      key: 'due_count',
      className: 'text-center tabular-nums font-semibold',
      render: (row) => row.due_count,
    },
    {
      header: 'Invoices Created',
      key: 'invoices_created',
      className: 'text-center tabular-nums',
      render: (row) => (
        <span className="font-bold text-status-success">{row.invoices_created}</span>
      ),
    },
    {
      header: 'Already Billed',
      key: 'skipped_existing',
      className: 'text-center tabular-nums text-surface-muted',
      render: (row) => row.skipped_existing,
    },
    {
      header: 'Failed',
      key: 'failed',
      className: 'text-center tabular-nums',
      render: (row) =>
        row.failed > 0 ? (
          <Badge variant="danger" className="tabular-nums">
            {row.failed} failed
          </Badge>
        ) : (
          <span className="text-surface-muted">0</span>
        ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row) =>
        row.failed === 0 ? (
          <Badge variant="success" className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </Badge>
        ) : (
          <Badge variant="warning" className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> With Failures
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Billing Engine"
        subtitle="Automated batch invoice generation, idempotency controls, and scheduled billing logs."
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              icon={RotateCw}
              onClick={fetchRuns}
              loading={loading}
              title="Refresh list"
            >
              Refresh
            </Button>
            <Button
              icon={Play}
              onClick={handleRunBilling}
              loading={running}
            >
              Run Billing Now
            </Button>
          </div>
        }
      />

      {/* KPI Tiles Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-card">
          <div className="text-[12px] font-medium text-surface-muted mb-1">Last Run Status</div>
          <div className="text-[20px] font-bold text-surface-text flex items-center gap-2">
            {lastRun ? (
              lastRun.failed === 0 ? (
                <span className="text-status-success flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5" /> Successful
                </span>
              ) : (
                <span className="text-status-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-5 h-5" /> {lastRun.failed} failed
                </span>
              )
            ) : (
              'No runs yet'
            )}
          </div>
          <div className="text-[11px] text-surface-muted mt-2">
            {lastRun ? `Trigger: ${lastRun.triggered_by}` : 'Pending first execution'}
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-card">
          <div className="text-[12px] font-medium text-surface-muted mb-1">Invoices Generated (Last Run)</div>
          <div className="text-[28px] font-bold text-brand tabular-nums">
            {lastRun?.invoices_created ?? 0}
          </div>
          <div className="text-[11px] text-surface-muted mt-1">New invoices created</div>
        </div>

        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-card">
          <div className="text-[12px] font-medium text-surface-muted mb-1">Already Billed (Skipped)</div>
          <div className="text-[28px] font-bold text-surface-text tabular-nums">
            {lastRun?.skipped_existing ?? 0}
          </div>
          <div className="text-[11px] text-surface-muted mt-1">Idempotent period checks</div>
        </div>

        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-card">
          <div className="text-[12px] font-medium text-surface-muted mb-1">Total Run History</div>
          <div className="text-[28px] font-bold text-surface-text tabular-nums">
            {total}
          </div>
          <div className="text-[11px] text-surface-muted mt-1">Batch runs recorded</div>
        </div>
      </div>

      {/* Runs Table Card */}
      <div className="bg-white rounded-[16px] border border-surface-border shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <h3 className="font-semibold text-surface-text text-[15px]">Billing Execution History</h3>
          <span className="text-[12px] text-surface-muted">
            Ordered by most recent execution
          </span>
        </div>

        <Table
          columns={columns}
          data={runs}
          loading={loading}
          emptyMessage="No billing runs recorded yet. Click 'Run Billing Now' to execute the first run."
          emptyActionLabel="Run Billing Now"
          onEmptyAction={handleRunBilling}
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

export default BillingPage;
