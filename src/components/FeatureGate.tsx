import type { ReactNode } from 'react';
import { useAuth, useFeature } from '../auth';
import { can } from '../lib/permissions';
import { FEATURE_LABELS } from '../lib/features';
import type { FeatureKey, PermissionKey } from '../types';
import { Empty, PageHeader } from './ui';

/** Renders its children only when the organization's package includes the feature. */
export function RequireFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const allowed = useFeature(feature);
  const { org, user } = useAuth();
  if (allowed) return <>{children}</>;
  const canUpgrade = user?.role === 'owner';
  return (
    <>
      <PageHeader title={FEATURE_LABELS[feature]} />
      <Empty
        title="Not part of your current package"
        hint={
          canUpgrade
            ? `${org?.packageName ?? 'Your'} package does not include ${FEATURE_LABELS[feature].toLowerCase()}. Contact Coplaces to upgrade and switch it on.`
            : `Your coworking space's package does not include ${FEATURE_LABELS[feature].toLowerCase()}. Ask the owner about upgrading.`
        }
      />
    </>
  );
}

/** Renders its children only when the signed-in team member has been given the permission. */
export function RequirePermission({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const { user } = useAuth();
  if (can(user, permission)) return <>{children}</>;
  return (
    <>
      <PageHeader title="No access" />
      <Empty title="You do not have access to this" hint="Ask the owner of your coworking space to give you the permission." />
    </>
  );
}
