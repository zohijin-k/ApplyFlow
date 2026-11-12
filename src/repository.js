// SQL과 업무 정책을 분리합니다. 이 파일의 변경 함수 자체는 권한을 검사하지 않습니다.
// 서비스에서 규칙을 판단한 후 사용하세요. 필요하면 저장 함수를 확장할 수 있습니다.
export function createRepository(db) {
  const selection=`SELECT a.id,a.event_id AS eventId,a.user_id AS userId,a.status,
    a.created_at AS createdAt,a.updated_at AS updatedAt,u.name AS applicantName,e.title AS eventTitle
    FROM applications a JOIN users u ON u.id=a.user_id JOIN events e ON e.id=a.event_id`;
  return {
    db,
    event(id) { return db.prepare('SELECT id,title,description,capacity,manager_id AS managerId FROM events WHERE id=?').get(id); },
    events() { return db.prepare(`SELECT e.id,e.title,e.description,e.capacity,e.manager_id AS managerId,
      (SELECT COUNT(*) FROM applications a WHERE a.event_id=e.id AND a.status='APPROVED') AS approvedCount
      FROM events e ORDER BY e.id`).all(); },
    application(id) { return db.prepare(selection+' WHERE a.id=?').get(id); },
    existing(eventId,userId) { return db.prepare(selection+' WHERE a.event_id=? AND a.user_id=?').get(eventId,userId); },
    mine(userId) { return db.prepare(selection+' WHERE a.user_id=? ORDER BY a.id DESC').all(userId); },
    forEvent(eventId) { return db.prepare(selection+' WHERE a.event_id=? ORDER BY a.id').all(eventId); },
    approvedCount(eventId) { return db.prepare("SELECT COUNT(*) AS n FROM applications WHERE event_id=? AND status='APPROVED'").get(eventId).n; },
    nextPending(eventId) { return db.prepare(selection+" WHERE a.event_id=? AND a.status='PENDING' ORDER BY a.created_at ASC,a.id ASC LIMIT 1").get(eventId); },
    insert(eventId,userId) { const r=db.prepare("INSERT INTO applications(event_id,user_id,status) VALUES (?,?,'PENDING')").run(eventId,userId); return this.application(Number(r.lastInsertRowid)); },
    // 대기 순서와 이력 저장 시점, 트랜잭션 경계는 서비스에서 결정합니다.
    history(id) { return db.prepare(`SELECT id,application_id AS applicationId,actor_id AS actorId,
      action,from_status AS fromStatus,to_status AS toStatus,reason,cause_history_id AS causeHistoryId,
      created_at AS createdAt FROM application_history WHERE application_id=? ORDER BY id`).all(id); },
    addHistory({applicationId,actorId,action,fromStatus=null,toStatus,reason=null,causeHistoryId=null}) {
      const r=db.prepare(`INSERT INTO application_history(application_id,actor_id,action,from_status,to_status,reason,cause_history_id)
        VALUES (?,?,?,?,?,?,?)`).run(applicationId,actorId,action,fromStatus,toStatus,reason,causeHistoryId);
      return Number(r.lastInsertRowid);
    },
    setStatus(id,status) { db.prepare("UPDATE applications SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(status,id); return this.application(id); }
  };
}
