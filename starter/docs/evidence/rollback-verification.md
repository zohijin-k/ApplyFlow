# 트랜잭션 롤백 검증

## 트랜잭션 경계

`src/application-service.js`의 `transaction(db, work)`는 `BEGIN IMMEDIATE`로 쓰기 잠금을 확보한 뒤 검증, 상태 변경, 이력 INSERT를 실행합니다. 정상 결과를 COMMIT하고 예외가 발생하면 ROLLBACK합니다. APPLY·CANCEL·APPROVE는 신청 상태와 해당 이력 한 건을 포함합니다. REVOKE는 대상 상태 및 이력, 대기자 검색, 승급 상태 및 이력까지 같은 경계 안에 포함합니다.

대기자는 `src/repository.js`의 `nextPending(eventId)`에서 같은 행사와 PENDING 조건을 만족하는 행 중 `created_at ASC, id ASC LIMIT 1`로 선택합니다. REVOKE 이력 INSERT가 반환한 ID를 AUTO_APPROVE 이력의 `cause_history_id`로 저장합니다.

## 오류 주입 검증

| 테스트 | 오류 주입 | 실패 지점 | 비교한 요청 전후 상태 | 결과 |
|---|---|---|---|---|
| T28 | `application_history`에 APPLY 행 INSERT 시 SQLite trigger가 `RAISE(ABORT, ...)` 수행 | APPLY 이력 저장 | applications 전체 및 application_history 전체 | 500, 전체 롤백 PASS. 트리거 제거 후 재신청 201 |
| T29 | AUTO_APPROVE 이력 INSERT 시 trigger 오류 | 승급 이력 저장 | 기존 APPROVED 신청, 대상 PENDING 신청, 모든 이력 | 500, REVOKE·승급 상태 변경과 두 이력 모두 롤백 PASS. 트리거 제거 후 재요청과 승급 성공 |
| T30 | APPROVE, CANCEL, REVOKE 각각에 history INSERT 오류 trigger | 각 변경 이력 저장 | applications 전체 및 application_history 전체 | 각 요청 500, 상태와 이력 불변 PASS |

트리거 설치·제거 및 전후 전체 스냅샷 비교 코드는 `tests/assignment.test.js`의 T28~T30에 있습니다. 테스트 결과 로그의 `TEST_INJECTED_FAILURE`는 이 입력 주입을 뜻하며 프로덕션 코드의 오류 처리가 아닙니다.

## REVOKE와 자동 승급 흐름

```text
BEGIN IMMEDIATE
  신청·담당자·APPROVED 최신 상태 확인
  대상 신청 APPROVED → REVOKED
  REVOKE 이력 INSERT (reason 저장)
  같은 행사 PENDING 중 created_at ASC, id ASC 첫 건 선택
  있으면 PENDING → APPROVED
  AUTO_APPROVE 이력 INSERT (cause_history_id = REVOKE 이력 ID)
COMMIT

어느 단계에서든 예외 → ROLLBACK
```

## 코드와 테스트 근거

- `src/application-service.js`: `transaction`, `apply`, `cancel`, `approve`, `revoke`
- `src/repository.js`: `nextPending`, `setStatus`, `addHistory`
- `tests/assignment.test.js`: T28, T29, T30의 SQLite trigger와 전후 스냅샷 assertion
