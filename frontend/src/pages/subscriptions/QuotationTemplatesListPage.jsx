import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Table } from '../../components/Table';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { Pagination } from '../../components/Pagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { QuotationTemplateModal } from './QuotationTemplateModal';
import { Plus, Search, Edit2, Trash2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const QuotationTemplatesListPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Delete dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== '') params.isActive = statusFilter;

      const res = await api.get('/quotation-templates', { params });
      // api unwraps response.data.data or returns full response
      if (Array.isArray(res)) {
        setTemplates(res);
        setTotal(res.length);
      } else if (res?.data && Array.isArray(res.data)) {
        setTemplates(res.data);
        setTotal(res.total || res.data.length);
      } else if (res?.items && Array.isArray(res.items)) {
        setTemplates(res.items);
        setTotal(res.total || res.items.length);
      } else {
        setTemplates([]);
        setTotal(0);
      }
    } catch (err) {
      toast.error('Failed to load quotation templates');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenCreate = () => {
    setSelectedTemplateId(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (tmpl) => {
    setSelectedTemplateId(tmpl.id);
    setModalOpen(true);
  };

  const handleOpenDelete = (tmpl) => {
    setDeletingTemplate(tmpl);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTemplate) return;
    try {
      setDeleteLoading(true);
      await api.delete(`/quotation-templates/${deletingTemplate.id}`);
      toast.success('Template deleted / deactivated successfully');
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
      fetchTemplates();
    } catch (err) {
      // error handled by api interceptor
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = [
    {
      header: 'Template Name',
      key: 'name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-surface-text">{row.name}</div>
            {row.notes && (
              <div className="text-[12px] text-surface-muted truncate max-w-xs">{row.notes}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Default Plan',
      key: 'plan_name',
      render: (row) => (
        <div>
          <div className="font-medium text-surface-text">{row.plan_name}</div>
          <div className="text-[12px] text-surface-muted">
            {row.plan_billing_period} • ₹{row.plan_price}
          </div>
        </div>
      ),
    },
    {
      header: 'Validity',
      key: 'validity_days',
      render: (row) => (
        <span className="tabular-nums font-medium text-surface-text">
          {row.validity_days} days
        </span>
      ),
    },
    {
      header: 'Lines',
      key: 'line_count',
      render: (row) => (
        <span className="tabular-nums text-surface-muted text-[13px]">
          {row.line_count || 0} product line{row.line_count === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      header: 'Status',
      key: 'is_active',
      render: (row) =>
        row.is_active ? (
          <Badge variant="success" className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Active
          </Badge>
        ) : (
          <Badge variant="neutral" className="inline-flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Inactive
          </Badge>
        ),
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenEdit(row)}
            title="Edit template"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-status-danger hover:text-status-danger hover:bg-status-danger-soft"
            onClick={() => handleOpenDelete(row)}
            title="Delete template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotation Templates"
        subtitle="Standardize recurring subscriptions with preconfigured plans, line items, and validity periods."
        action={
          <Button icon={Plus} onClick={handleOpenCreate}>
            New Template
          </Button>
        }
      />

      {/* Filters Card */}
      <div className="bg-white rounded-[16px] border border-surface-border p-4 shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 text-surface-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search templates or plans..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-[13px] bg-surface-canvas/50 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-[13px] px-3 py-2 bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Templates Table Card */}
      <div className="bg-white rounded-[16px] border border-surface-border shadow-card overflow-hidden">
        <Table
          columns={columns}
          data={templates}
          loading={loading}
          emptyMessage="No quotation templates found. Create one to fast-track subscription onboarding."
          emptyActionLabel="Create First Template"
          onEmptyAction={handleOpenCreate}
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <QuotationTemplateModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          templateId={selectedTemplateId}
          onSuccess={fetchTemplates}
        />
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Quotation Template"
        message={`Are you sure you want to remove "${deletingTemplate?.name}"? If any subscriptions reference this template, it will be safely deactivated instead.`}
        confirmText="Confirm Delete"
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  );
};

export default QuotationTemplatesListPage;

