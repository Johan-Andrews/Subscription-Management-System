import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { UserPlus, Shield, Power, Edit2 } from 'lucide-react';
import { PasswordChecklist, isPasswordValid } from '../../components/PasswordChecklist';
import toast from 'react-hot-toast';

export const StaffListPage = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states (Create)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Form states (Edit)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  const allRulesPassed = isPasswordValid(password);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users/staff');
      setStaff(data || []);
    } catch (err) {
      console.error('Failed to load staff list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    if (!allRulesPassed) {
      setFormError('Please fulfill all password requirements.');
      setFieldErrors({ password: 'Password does not meet all security requirements.' });
      return;
    }

    setCreating(true);
    try {
      await api.post('/users/staff', {
        fullName,
        email,
        password,
      });

      toast.success('Staff account created successfully');
      setModalOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setFieldErrors({});
      fetchStaff();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to create staff account';
      setFormError(msg);

      const details = err.response?.data?.error?.details || [];
      const map = {};
      details.forEach((d) => {
        if (d.field) map[d.field] = d.message;
      });
      setFieldErrors(map);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (member) => {
    const newStatus = !member.isActive;
    const action = newStatus ? 'activate' : 'deactivate';

    if (member.role === 'ADMIN') {
      toast.error('Cannot deactivate admin account');
      return;
    }

    try {
      await api.patch(`/users/staff/${member.id}`, {
        isActive: newStatus,
      });
      toast.success(`Staff member ${action}d successfully`);
      setStaff((prev) =>
        prev.map((s) => (s.id === member.id ? { ...s, isActive: newStatus } : s))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCreate = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setFormError('');
    setFieldErrors({});
    setModalOpen(true);
  };

  const handleOpenEdit = (member) => {
    setEditingStaff(member);
    setEditFullName(member.fullName || '');
    setEditError('');
    setEditModalOpen(true);
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    setEditError('');
    setUpdating(true);
    try {
      await api.patch(`/users/staff/${editingStaff.id}`, {
        fullName: editFullName,
      });
      toast.success('Staff member updated successfully');
      setEditModalOpen(false);
      setStaff((prev) =>
        prev.map((s) => (s.id === editingStaff.id ? { ...s, fullName: editFullName } : s))
      );
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update staff';
      setEditError(msg);
    } finally {
      setUpdating(false);
    }
  };

  const columns = [
    {
      header: 'Staff Member',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-soft text-brand font-bold text-[13px] flex items-center justify-center">
            {row.fullName ? row.fullName[0].toUpperCase() : 'S'}
          </div>
          <div>
            <div className="font-semibold text-surface-text">{row.fullName}</div>
            <div className="text-[12px] text-surface-muted">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      render: (row) => (
        <Badge variant={row.role === 'ADMIN' ? 'brand' : 'neutral'}>
          {row.role === 'ADMIN' ? (
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" /> Admin
            </span>
          ) : (
            'Staff'
          )}
        </Badge>
      ),
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'danger'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
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
      render: (row) =>
        row.role !== 'ADMIN' && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenEdit(row)}
              className="text-[12px]"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              Edit
            </Button>
            <Button
              variant={row.isActive ? 'outline' : 'secondary'}
              size="sm"
              onClick={() => handleToggleActive(row)}
              className="text-[12px]"
            >
              <Power className="w-3.5 h-3.5 mr-1" />
              {row.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Only Administrators can create and manage staff accounts."
        actions={
          <Button icon={UserPlus} onClick={handleOpenCreate}>
            Add Staff Member
          </Button>
        }
      />

      <Card padding={false}>
        <Table
          columns={columns}
          data={staff}
          loading={loading}
          emptyMessage="No staff members found."
          emptyActionLabel="Add First Staff Member"
          onEmptyAction={handleOpenCreate}
        />
      </Card>

      {/* Add Staff Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Staff Account"
        subtitle="New staff members can log in immediately to manage subscriptions and invoices."
      >
        {formError && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {formError}
          </div>
        )}

        <form onSubmit={handleCreateStaff} className="space-y-4">
          <Input
            label="Full Name"
            name="fullName"
            placeholder="John Smith"
            value={fullName}
            error={fieldErrors.fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: '' }));
            }}
            required
            autoFocus
          />

          <Input
            label="Staff Email"
            type="email"
            name="email"
            placeholder="staff@brightloop.test"
            value={email}
            error={fieldErrors.email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
            }}
            required
          />

          <div>
            <label className="block text-[12px] font-medium text-surface-muted mb-1.5">
              Initial Password <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
              }}
              required
              className={`w-full px-3 py-2 text-[14px] bg-white border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors ${
                fieldErrors.password ? 'border-status-danger' : 'border-surface-border'
              }`}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-[12px] text-status-danger">{fieldErrors.password}</p>
            )}

            {/* Live Password Checklist */}
            <PasswordChecklist password={password} title="Password Requirements:" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creating}
              disabled={!allRulesPassed}
            >
              Create Staff
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Staff Member"
        subtitle={`Update account details for ${editingStaff?.email || ''}`}
      >
        {editError && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {editError}
          </div>
        )}

        <form onSubmit={handleUpdateStaff} className="space-y-4">
          <Input
            label="Full Name"
            name="editFullName"
            placeholder="John Smith"
            value={editFullName}
            onChange={(e) => setEditFullName(e.target.value)}
            required
            autoFocus
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updating}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StaffListPage;

