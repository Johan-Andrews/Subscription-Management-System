import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Button } from './Button';
import { Card } from './Card';
import { Badge } from './Badge';
import { Clock, ArrowRight } from 'lucide-react';

export const ComingSoon = ({
  title = 'Module Coming Soon',
  description = 'This section is currently under development by the engineering team and will be available once the next phase is merged.',
  area,
}) => {
  const { role } = useAuth();
  const isCustomer = area === 'portal' || role === 'CUSTOMER';
  const returnPath = isCustomer ? '/portal/profile' : '/customers';
  const returnLabel = isCustomer ? 'Go to My Profile' : 'Go to Customers';

  return (
    <div className="py-12 flex items-center justify-center">
      <Card className="max-w-lg w-full text-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Clock className="w-7 h-7" />
        </div>

        <div className="mb-2">
          <Badge variant="info">In Development</Badge>
        </div>

        <h2 className="text-[22px] font-bold text-surface-text mb-2 tracking-tight">
          {title}
        </h2>

        <p className="text-[14px] text-surface-muted mb-6 leading-relaxed">
          {description}
        </p>

        <div className="flex justify-center">
          <Link to={returnPath}>
            <Button icon={ArrowRight}>
              {returnLabel}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default ComingSoon;
