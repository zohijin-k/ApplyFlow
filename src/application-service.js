import { AppError, missing, forbidden, invalidState } from './errors.js';

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    if (error?.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: applications\.event_id, applications\.user_id/.test(error?.message ?? '')) {
      throw new AppError(409, 'ALREADY_APPLIED', '이미 신청한 행사입니다.');
    }
    throw error;
  }
}

export function createApplicationService(repo) {
  return {
    apply(actor,eventId) {
      return transaction(repo.db, () => {
        const event = repo.event(eventId);
        if (!event) throw missing('행사');
        if (actor.role !== 'STUDENT') throw forbidden();
        if (repo.existing(eventId, actor.id)) throw new AppError(409,'ALREADY_APPLIED','이미 신청한 행사입니다.');
        const application = repo.insert(eventId, actor.id);
        repo.addHistory({ applicationId: application.id, actorId: actor.id, action: 'APPLY', toStatus: 'PENDING' });
        return repo.application(application.id);
      });
    },
    cancel(actor,applicationId) {
      return transaction(repo.db, () => {
        const current = repo.application(applicationId);
        if (!current) throw missing('신청');
        if (actor.role !== 'STUDENT' || current.userId !== actor.id) throw forbidden();
        if (current.status !== 'PENDING') throw invalidState();
        const updated = repo.setStatus(current.id, 'CANCELLED');
        repo.addHistory({ applicationId: current.id, actorId: actor.id, action: 'CANCEL', fromStatus: 'PENDING', toStatus: 'CANCELLED' });
        return repo.application(updated.id);
      });
    },
    approve(actor,applicationId) {
      return transaction(repo.db, () => {
        const current = repo.application(applicationId);
        if (!current) throw missing('신청');
        const event = repo.event(current.eventId);
        if (actor.role !== 'MANAGER' || event.managerId !== actor.id) throw forbidden();
        if (current.status !== 'PENDING') throw invalidState();
        if (repo.approvedCount(current.eventId) >= event.capacity) throw new AppError(409,'CAPACITY_FULL','행사 정원이 가득 찼습니다.');
        repo.setStatus(current.id, 'APPROVED');
        repo.addHistory({ applicationId: current.id, actorId: actor.id, action: 'APPROVE', fromStatus: 'PENDING', toStatus: 'APPROVED' });
        return repo.application(current.id);
      });
    },
    revoke(actor,applicationId,reason) {
      return transaction(repo.db, () => {
        const current = repo.application(applicationId);
        if (!current) throw missing('신청');
        const event = repo.event(current.eventId);
        if (actor.role !== 'MANAGER' || event.managerId !== actor.id) throw forbidden();
        if (current.status !== 'APPROVED') throw invalidState();

        repo.setStatus(current.id, 'REVOKED');
        const causeHistoryId = repo.addHistory({ applicationId: current.id, actorId: actor.id, action: 'REVOKE', fromStatus: 'APPROVED', toStatus: 'REVOKED', reason });
        const next = repo.nextPending(current.eventId);
        let promoted = null;
        if (next) {
          repo.setStatus(next.id, 'APPROVED');
          repo.addHistory({ applicationId: next.id, actorId: actor.id, action: 'AUTO_APPROVE', fromStatus: 'PENDING', toStatus: 'APPROVED', causeHistoryId });
          promoted = repo.application(next.id);
        }
        return { revoked: repo.application(current.id), promoted };
      });
    }
  };
}
