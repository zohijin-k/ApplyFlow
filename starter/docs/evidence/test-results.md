# 검증 실행 결과

## 실행 환경

- 실행 일자: 2026-11-12 (Asia/Seoul)
- Node.js: v24.22.3
- 프로젝트 요구 버전: Node.js 24.x
- 의존성: package-lock.json 기준 `npm ci` (엔진 검사 유지)
- 기본 셸의 Node 26과 별도로 임시 Node 24 런타임을 사용했습니다.

## 결과

| 명령 | 결과 | 확인 |
|---|---:|---|
| `npm test` | PASS 4 / FAIL 0 | 기반 기능 및 로그인·조회·입력 계약 |
| `npm run test:assignment` | PASS 32 / FAIL 0 | T01~T32 전체 |
| `npm run test:advanced` | PASS 1 / FAIL 0 | 두 서버 동시 승인 20회 반복 |
| `node --test tests/concurrency-supplement.test.js` | PASS 1 / FAIL 0 | 중복 신청·동시 승인 취소 각 10회, 다른 학생 동시 신청, DB 무결성 |

T28~T30 출력의 `TEST_INJECTED_FAILURE`는 테스트가 이력 INSERT를 중단시켜 롤백을 확인한 의도적 오류입니다. 해당 테스트는 오류 뒤 상태와 이력의 스냅샷이 요청 전과 같음을 비교하고, 일부 테스트에서는 실패 원인을 제거한 뒤 재시도 성공도 확인합니다.

## T01~T32 요약

각 시나리오는 `starter/tests/assignment.test.js`의 동명 테스트가 HTTP 결과와 DB 상태·이력을 함께 확인합니다. 아래 항목은 모두 PASS입니다.

| 테스트 | 검증 범위 | 결과 |
|---|---|---|
| T01~T05 | 신청, 인증, 위조 필드, 중복, 다른 행사 | PASS |
| T06~T09 | 본인 대기 취소, 담당 운영자 승인 권한 | PASS |
| T10~T12 | 취소 후 오래된 승인, 반복 취소·승인, 금지 전이 | PASS |
| T13~T16 | 정원 제한, 오류 순서, ID 조회, DB 재연결 | PASS |
| T17~T20 | 대기자 없음, FIFO 시각·ID 정렬, 행사·상태 필터 | PASS |
| T21~T23 | 승인 취소 권한·상태·사유 검증 | PASS |
| T24~T25 | 행위자·전후 상태·reason·causeHistoryId | PASS |
| T26~T27 | 거부 요청 불변, 이력 조회 권한 | PASS |
| T28~T30 | APPLY·AUTO_APPROVE·APPROVE·CANCEL·REVOKE INSERT 실패 롤백 | PASS |
| T31~T32 | 재연결 후 이력 보존, 연속 승인 취소 | PASS |

## 선택 심화 동시성 검사

`starter/tests/concurrency.test.js`가 같은 SQLite DB를 여는 서버 프로세스 두 개를 실행했습니다. 행사 2의 마지막 한 자리에 두 PENDING 신청을 동시에 승인하도록 매 반복 요청을 보냈고 20회 모두 HTTP 200 한 건과 409 `CAPACITY_FULL` 한 건이 반환됐습니다. 매 회차 APPROVED는 한 건, PENDING은 한 건으로 남았습니다.

이 검사는 구현된 `BEGIN IMMEDIATE` 직렬화가 이 경쟁 시나리오에서 정원 초과를 막는다는 증거입니다. 모든 OS·장치·부하에서 경쟁 조건이 없음을 증명하지는 않습니다.

추가 두 서버 검사에서는 동일 학생·행사 신청 경쟁을 10회 실행해 매회 201 한 건과 409 `ALREADY_APPLIED` 한 건, 신청 1건과 APPLY 이력 1건을 확인했습니다. 서로 다른 두 학생의 동시 신청은 둘 다 201이었습니다. 동일한 승인 취소 2건의 경쟁도 10회 반복해 매회 200 한 건과 409 `INVALID_STATE` 한 건, 첫 대기자 한 명만 승급, REVOKE/AUTO_APPROVE 이력 각 1건, causeHistoryId 일치, `PRAGMA integrity_check = ok`를 확인했습니다.

## 화면 검증

Node.js v24.22.3 서버와 임시 SQLite DB를 사용하는 headless Chrome에서 U01~U05 실제 화면 흐름을 확인하고 캡처를 `docs/evidence/screenshots/`에 저장했습니다. U03은 같은 DB로 서버를 재시작했습니다. 세부 절차와 각 증거 파일은 `screen-verification.md`에 기록했습니다.
