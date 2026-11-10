'use client';
import { useId, useState } from 'react';
import type { AreaStatus, CasePrep } from '@/lib/contracts';

const statusLabels: Record<AreaStatus, string> = {
  not_asked: 'Not asked',
  probing: 'In progress',
  strong: 'Strong',
  weak: 'Weak',
  untested: 'Untested',
};

export function CaseProgress({ record, areas }: { record: CasePrep; areas: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const titleId = useId();
  const labels = new Map(areas.map(area => [area.id, area.label]));
  const covered = record.areas.filter(area => area.status === 'strong' || area.status === 'weak' || area.status === 'untested').length;
  return <section className="case-progress" aria-labelledby={titleId}>
    <div className="case-progress-head">
      <h2 id={titleId}>Case progress</h2>
      <p className="muted">{covered} of {record.areas.length} areas covered</p>
      <button type="button" className="quiet small case-progress-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}>
        {open ? 'Hide areas' : 'Show areas'}
      </button>
    </div>
    <ol id={listId} className={`case-progress-list${open ? ' open' : ''}`}>
      {record.areas.map(area => <li key={area.id} className={`area-${area.status}`} aria-current={area.id === record.currentAreaId && !record.complete ? 'step' : undefined}>
        <span className="case-progress-label">{labels.get(area.id) ?? area.id}</span>
        <span className="case-progress-status">{statusLabels[area.status]}</span>
      </li>)}
    </ol>
  </section>;
}
