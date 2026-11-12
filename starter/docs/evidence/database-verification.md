# 데이터베이스 상태 및 이력 검증

SQLite 스키마는 `src/db.js`에서 초기화합니다. `applications`는 `UNIQUE(event_id,user_id)`로 신청을 사용자·행사별 한 건으로 제한하고, 상태는 PENDING·APPROVED·CANCELLED·REVOKED CHECK 제약을 사용합니다. `application_history`는 행위자·행위·전후 상태·reason·cause_history_id·시각을 보존합니다.

## SQL 확인 쿼리

실제 DB에서 신청 상태와 행사별 승인 인원을 확인하는 쿼리입니다.

```sql
SELECT id, event_id, user_id, status, created_at, updated_at
FROM applications
ORDER BY id;

SELECT event_id, COUNT(*) AS approved_count
FROM applications
WHERE status = 'APPROVED'
GROUP BY event_id;

SELECT id, application_id, actor_id, action, from_status, to_status,
       reason, cause_history_id, created_at
FROM application_history
ORDER BY id;
```

## 확인 결과

- T13: 행사 1의 정원 2명을 채운 후 세 번째 신청은 409 `CAPACITY_FULL`이며 PENDING 상태와 이력은 변하지 않았습니다.
- T17: 대기자가 없는 승인 취소는 REVOKED, `promoted=null`, 승인 인원 0명으로 종료됐습니다.
- T18~T20: 같은 행사 PENDING만 후보가 되고 created_at이 빠른 신청, 동률이면 ID가 작은 신청이 선택됐습니다. CANCELLED 및 다른 행사는 제외됐습니다.
- T25: 자동 승급 이력의 `causeHistoryId`가 승인 취소 이력 ID와 같고, actorId는 취소를 수행한 운영자 ID였습니다.
- T31: DB를 닫고 재연결한 뒤 모든 신청 행과 이력 행이 전과 같았습니다.
- T32: 연속 취소는 요청마다 최대 한 명만 승급했고, 종료 상태를 다시 취소해도 추가 이력은 생기지 않았습니다.
- T28~T30: 이력 저장 실패 후 applications와 application_history 전체가 요청 전 스냅샷과 일치했습니다.
- `tests/concurrency-supplement.test.js`: 두 서버가 같은 학생의 중복 신청 10회, 서로 다른 학생의 동시 신청, 동일 신청의 승인 취소 경쟁 10회를 처리했습니다. 중복은 201/409 한 건씩, 취소 경쟁은 200/409 한 건씩 반환했고 매회 FIFO 한 명만 승인됐습니다. SQLite `PRAGMA integrity_check` 결과는 `ok`였습니다.

위 결과는 `tests/assignment.test.js`의 SQL 직접 조회·snapshot assertion을 실행한 결과입니다. 테스트 실행은 별도 임시 DB를 쓰며 제출용 `data/app.sqlite`를 변경하지 않습니다.
