import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Textarea } from '../../components/Textarea';
import { Spinner } from '../../components/Spinner';
import { UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export const CustomerProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    async function loadCustomer() {
      setLoading(true);
      try {
        const cust = await api.get('/me/customer');
        if (cust) {
          setName(cust.name || '');
          setEmail(cust.email || user?.email || '');
          setPhone(cust.phone || '');
          setCompany(cust.company || '');
          setAddress(cust.address || '');
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/me/customer', {
        name,
        phone: phone || null,
        company: company || null,
        address: address || null,
      });

      toast.success('Profile updated successfully');
      await refreshUser();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update profile';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-surface-text tracking-tight">
          My Account Profile
        </h1>
        <p className="text-[14px] text-surface-muted mt-1">
          Manage your personal details and invoice billing address.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center gap-4 pb-6 border-b border-surface-border">
            <div className="w-16 h-16 rounded-full bg-brand-soft text-brand font-bold text-2xl flex items-center justify-center">
              {name ? name[0].toUpperCase() : 'U'}
            </div>
            <div>
              <div className="text-[18px] font-semibold text-surface-text">{name || 'Customer'}</div>
              <div className="text-[13px] text-surface-muted">{email}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Account Email"
              type="email"
              value={email}
              disabled
              helperText="Contact support to change your account email."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              type="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
            />

            <Input
              label="Company / Business Name"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <Textarea
            label="Billing Address"
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder="Street address, City, State, Postal Code..."
          />

          <div className="flex items-center justify-end pt-4 border-t border-surface-border">
            <Button
              type="submit"
              loading={saving}
              icon={UserCheck}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default CustomerProfilePage;

