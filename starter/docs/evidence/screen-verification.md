# 화면 검증 기록

실제 화면은 임시 DB와 headless Chrome을 사용해 확인했습니다. U03은 같은 SQLite 파일을 유지한 채 서버 프로세스를 종료·재실행한 뒤 다시 로그인했습니다. U04와 U05는 각각 DB를 초기화하고 시나리오를 처음부터 실행했습니다. 캡처 파일은 `screenshots/` 아래에 있습니다.

| ID | 결과 | 증거 |
|---|---|---|
| U01 | alice 신청 → manager1 승인. 목록에서 참가 승인과 승인 인원 1/2를 확인했습니다. | `screenshots/U01-student-application-manager-approval.png` |
| U02 | 별도 화면의 charlie가 대기 신청을 취소한 뒤, PENDING으로 남아 있던 manager 화면에서 승인을 시도했습니다. 409 `INVALID_STATE`가 표시되고 목록은 CANCELLED로 갱신됐습니다. | `screenshots/U02-stale-manager-approval-rejected.png` |
| U03 | 서버 종료·재실행·재로그인 후 Alice의 APPROVED, Charlie의 CANCELLED 상태와 Alice의 APPLY·APPROVE 이력이 표시됐습니다. | `screenshots/U03-state-history-after-server-restart.png` |
| U04 | 행사 2에서 Alice·Bob·Charlie 순서로 신청하고 Alice 승인 취소. Bob은 AUTO_APPROVE, Charlie는 PENDING으로 남았습니다. Alice REVOKE와 Bob AUTO_APPROVE 이력, 원인 ID #5 연결이 화면에 표시됐습니다. | `screenshots/U04-fifo-promotion-history.png` |
| U05 | 대기자 없이 Alice 승인을 취소했습니다. REVOKED와 승인 수 0/정원 1을 확인했고 최근 API 응답의 `promoted` 값은 `null`이었습니다. | `screenshots/U05-no-waiter-empty-capacity.png` 및 브라우저 응답 데이터 |

서버는 Node.js v24.22.3에서 실행했습니다. 각 화면 흐름은 초기 DB를 분리해 테스트했고, U03만 상태 영속성 확인을 위해 같은 DB 파일을 유지했습니다.
