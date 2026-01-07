import { VAC_REASON_COPY_V1 } from './reasonCopy.v1.mjs';

export function deriveNextStep(decision) {
  const status = decision.status;
  if (status === 'verified') {
    return {
      status,
      title: 'No action needed',
      action: 'This claim is verified under the current VAC ruleset.',
    };
  }

  const reasons = Array.isArray(decision.reasons) ? [...decision.reasons] : [];

  if (status === 'rejected') {
    if (reasons.length === 0) {
      return {
        status,
        title: 'Unable to verify claim',
        action: 'Review the claim details and provide stronger evidence.',
      };
    }
    const top = VAC_REASON_COPY_V1[reasons[0]];
    return {
      status,
      title: top?.title ?? 'Unable to verify claim',
      action: top?.action ?? 'Address the primary blocker and resubmit.',
    };
  }

  // manual_review and unverified collapse into "under review" guidance.
  if (status === 'manual_review' || status === 'unverified') {
    if (reasons.length === 0) {
      return {
        status: 'manual_review',
        title: 'More information required',
        action: 'Provide additional evidence for this claim.',
      };
    }

    const priorityOrder = [
      'missing.website',
      'no.evidence.for.website',
      'single.domain.only',
      'multi_domain.required.for.verification',
      'stale.multi_domain.evidence',
      'needs.refresh',
      'weak.evidence.for.website',
      'identity.incomplete',
      'identity.structure.ok.no.external.evidence',
    ];

    const reasonSet = new Set(reasons);
    let chosen = reasons[0];
    for (const code of priorityOrder) {
      if (reasonSet.has(code)) {
        chosen = code;
        break;
      }
    }

    const copy = VAC_REASON_COPY_V1[chosen];
    return {
      status: 'manual_review',
      title: copy?.title ?? 'More information required',
      action:
        copy?.action ??
        'Provide additional, independent and recent evidence to move this claim out of review.',
    };
  }

  // Fallback for unknown statuses
  return {
    status,
    title: 'Status not recognized',
    action: 'Review this claim manually before taking action.',
  };
}
