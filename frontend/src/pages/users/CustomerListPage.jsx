import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table } from '../../components/Table';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/Input';
import { Textarea } from '../../components/Textarea';
import { UserPlus, Search, Edit2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const CustomerListPage = () => {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal & form states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', {
        params: {
          page,
          pageSize,
          search: search || undefined,
        },
      });
      setCustomers(res?.data || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setAddress('');
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust);
    setName(cust.name || '');
    setEmail(cust.email || '');
    setPhone(cust.phone || '');
    setCompany(cust.company || '');
    setAddress(cust.address || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const payload = {
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        address: address || null,
      };

      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, payload);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer created successfully');
      }

      setModalOpen(false);
      fetchCustomers();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save customer';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: 'Customer Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-canvas text-surface-muted font-bold text-[13px] flex items-center justify-center border border-surface-border">
            {row.name ? row.name[0].toUpperCase() : 'C'}
          </div>
          <div>
            <div className="font-semibold text-surface-text">{row.name}</div>
            {row.company && (
              <div className="text-[12px] text-surface-muted flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {row.company}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Email',
      accessor: 'email',
      render: (row) => (
        <span className="text-surface-muted">{row.email || '—'}</span>
      ),
    },
    {
      header: 'Phone',
      accessor: 'phone',
      render: (row) => (
        <span className="text-surface-muted tabular-nums">{row.phone || '—'}</span>
      ),
    },
    {
      header: 'Created On',
      render: (row) => (
        <span className="tabular-nums text-surface-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      cellClassName: 'text-right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpenEdit(row)}
          className="text-[12px]"
        >
          <Edit2 className="w-3 h-3 mr-1" />
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="View and manage corporate and individual customer accounts."
        actions={
          <Button icon={UserPlus} onClick={handleOpenCreate}>
            New Customer
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-surface-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-[13px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
          />
        </div>
      </div>

      <Card padding={false}>
        <Table
          columns={columns}
          data={customers}
          loading={loading}
          emptyMessage="No customers found."
          emptyActionLabel="Add Customer"
          onEmptyAction={handleOpenCreate}
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}
        subtitle="Manage contact information and billing address."
      >
        {formError && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {formError}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Customer or Contact Name"
            name="name"
            placeholder="e.g. Acme Corp / John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              name="email"
              placeholder="billing@acme.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Phone Number"
              type="tel"
              name="phone"
              placeholder="+91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Input
            label="Company Name"
            name="company"
            placeholder="Acme Technologies Ltd."
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />

          <Textarea
            label="Billing Address"
            name="address"
            placeholder="Floor 4, Tower B, Business Park..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingCustomer ? 'Save Changes' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CustomerListPage;
