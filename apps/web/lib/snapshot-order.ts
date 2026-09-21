export interface SnapshotOrderValue {
  readonly revision: number;
  readonly session: { readonly id: string; readonly sessionEpoch: number } | null;
}

export function shouldAcceptSnapshot(current: SnapshotOrderValue | null, next: SnapshotOrderValue, sequence: number, appliedSequence: number, mutationFence: number, authoritative = false) {
  if (sequence < appliedSequence) return false;
  if (!authoritative && sequence < mutationFence) return false;
  const currentIdentity = current?.session ? `${current.session.id}:${current.session.sessionEpoch}` : 'none';
  const nextIdentity = next.session ? `${next.session.id}:${next.session.sessionEpoch}` : 'none';
  if (currentIdentity === nextIdentity && current && next.revision < current.revision) return false;
  return true;
}
