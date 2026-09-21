import type { OverlayStateDto } from '@rogimarble/contracts';

/** Rejects stale polling responses. Both server revision clocks must be monotonic. */
export function isNewerOverlayState(next: OverlayStateDto, current: OverlayStateDto | null): boolean {
  if (!current) return true;
  if (!next.session) return true;
  if (!current.session) return true;
  if (next.session.id !== current.session.id) return next.session.createdAt >= current.session.createdAt;
  if (next.session.sessionEpoch !== current.session.sessionEpoch) return next.session.sessionEpoch > current.session.sessionEpoch;
  if (next.session.revision < current.session.revision || next.session.presentationEpoch < current.session.presentationEpoch) return false;
  return next.session.revision > current.session.revision || next.session.presentationEpoch >= current.session.presentationEpoch;
}
