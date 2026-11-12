# 과제 2 API 계약

## 기본 규칙

기본 주소는 http://127.0.0.1:3000 입니다. 보호 API에는 `Authorization: Bearer <JWT>`를 보냅니다. 로그인은 `{"username":"alice","password":"Classroom123!"}`를 사용하며 `{accessToken,user}`를 반환합니다. user의 필드는 id, username, name, role입니다. 역할은 STUDENT 또는 MANAGER이며 토큰 유효 시간은 30분입니다.

신청·대기 취소·직접 승인 본문은 `{}` 또는 생략입니다. 승인 취소는 `{"reason":"운영 사정으로 승인 취소"}`입니다. reason은 앞뒤 공백을 제거한 JavaScript 문자열 길이 기준 5~200자이며 추가 필드는 거부합니다. 인증된 actor를 사용하고 클라이언트의 신원·상태·역할을 받지 않습니다.

## API 목록

|메서드|경로|권한|성공|
|---|---|---|---|
|GET|/api/health|공개|200 `{status:"ok"}`|
|POST|/api/auth/login|공개|200 `{accessToken,user}`|
|GET|/api/me|로그인|200 user|
|GET|/api/events|공개|200 행사 배열|
|GET|/api/applications/mine|로그인|200 본인 신청 배열|
|GET|/api/events/:id/applications|담당 운영자|200 행사 신청 배열|
|GET|/api/applications/:id|신청자 또는 담당 운영자|200 신청 객체|
|GET|/api/applications/:id/history|신청자 또는 담당 운영자|200 이력 배열, ID 오름차순|
|POST|/api/events/:id/applications|학생|201 신청 객체 + Location|
|POST|/api/applications/:id/cancel|본인 학생|200 신청 객체|
|POST|/api/applications/:id/approve|담당 운영자|200 신청 객체|
|POST|/api/applications/:id/revoke|담당 운영자|200 `{revoked,promoted}`|

행사 필드: id, title, description, capacity, managerId, approvedCount.

신청 필드: id, eventId, userId, status, createdAt, updatedAt, applicantName, eventTitle. 날짜는 ISO 문자열입니다. revoke 응답의 revoked는 REVOKED 신청 객체, promoted는 자동 승인된 신청 객체 또는 null입니다.

## 상태와 대기열

|행위|변경 전|변경 후|주체|
|---|---|---|---|
|APPLY|없음|PENDING|학생|
|CANCEL|PENDING|CANCELLED|신청한 학생|
|APPROVE|PENDING|APPROVED|담당 운영자|
|REVOKE|APPROVED|REVOKED|담당 운영자|
|AUTO_APPROVE|PENDING|APPROVED|승인 취소 처리 내부|

- 같은 사용자·행사는 한 건만 유지합니다. CANCELLED·REVOKED도 재신청 불가입니다.
- APPROVED만 정원에 포함하며 직접 승인에서 정원 초과는 거부합니다.
- 직접 승인은 운영자가 PENDING 중 선택합니다. 대기 순서 강제는 자동 승급에 적용합니다.
- 승인 취소 때 같은 행사 PENDING 중 `created_at ASC, id ASC`로 첫 한 명을 자동 승인합니다. 취소 상태와 다른 행사는 제외합니다.
- 자동 승급은 요청당 최대 한 명입니다. 기존 빈자리가 더 있어도 전부 채우지 않습니다. 대기자가 없으면 promoted=null, 승인 인원은 한 명 감소합니다.
- 학생의 대기 취소는 승인 자리를 비우지 않으므로 자동 승급하지 않습니다. 학생의 승인된 신청 직접 취소는 불가입니다.
- CANCELLED·REVOKED는 종료 상태입니다. 재승인·재취소는 거부합니다.

## 변경 이력

모든 성공한 변경을 `application_history`에 저장합니다. 성공 응답마다 변경된 신청당 이력 한 건이며 기존 이력은 수정·삭제하지 않습니다. 거부·오류 요청은 이력을 추가하지 않습니다.

|API 필드|DB 컬럼|내용|
|---|---|---|
|id|id|이력 ID|
|applicationId|application_id|변경된 신청 ID|
|actorId|actor_id|요청한 로그인 사용자 ID|
|action|action|APPLY / CANCEL / APPROVE / REVOKE / AUTO_APPROVE|
|fromStatus|from_status|변경 전 상태, APPLY는 null|
|toStatus|to_status|변경 후 상태|
|reason|reason|REVOKE만 trim된 사유, 나머지는 null|
|causeHistoryId|cause_history_id|AUTO_APPROVE만 원인 REVOKE 이력 ID, 나머지는 null|
|createdAt|created_at|ISO 생성 시각|

AUTO_APPROVE의 actorId도 승인 취소를 요청한 담당 운영자입니다. 이력 조회는 해당 신청자와 행사 담당자만 허용합니다. 원인 이력 ID를 안다고 다른 사람의 이력을 읽을 권한이 생기지 않습니다.

## 검사 순서와 오류

1. 인증: 누락 401 TOKEN_REQUIRED, 무효 401 INVALID_TOKEN, 만료 401 TOKEN_EXPIRED.
2. ID와 본문 형식: 400 BAD_INPUT. JSON 구문 오류는 파서가 먼저 처리할 수 있습니다.
3. 행사 또는 신청 존재: 404 NOT_FOUND.
4. 학생·소유자·담당자 권한: 403 FORBIDDEN.
5. 신청 중복: 409 ALREADY_APPLIED. 변경 대상 상태: 409 INVALID_STATE.
6. 직접 승인 시 승인 인원이 정원 이상: 409 CAPACITY_FULL.
7. 상태와 성공 이력을 저장하고 응답합니다. 예기치 않은 저장 오류는 500 INTERNAL_ERROR입니다.

오류 본문은 `{code,message}`이며 message 문구는 자유입니다. 예를 들어 REVOKED를 다른 운영자가 승인 취소하면 403, 담당자가 승인 취소하면 409입니다. 형식이 유효한 없는 신청은 404입니다. 모든 거부와 저장 실패는 요청 전 상태·이력을 유지해야 합니다.

## 트랜잭션 요구사항

신청·대기 취소·직접 승인은 상태 저장과 해당 이력을 하나로 묶습니다. 승인 취소는 다음 전체를 하나의 트랜잭션으로 처리합니다.

1. 최신 대상과 권한·상태를 확인합니다.
2. 대상 신청을 REVOKED로 변경하고 REVOKE 이력을 저장합니다.
3. 같은 행사 대기자 중 다음 한 명을 선택합니다.
4. 있으면 APPROVED로 변경하고 AUTO_APPROVE 이력을 원인 ID와 함께 저장합니다.
5. 모두 성공하면 COMMIT, 도중 오류가 나면 ROLLBACK합니다.

작업 순서는 원인 관계와 정책을 지키는 범위에서 달라도 됩니다. 핵심은 부분 저장을 막는 것입니다. 실패한 이력만 다시 쓰거나 HTTP 오류만 반환하고 DB 변경을 남기는 구현은 불충족입니다.

## 제공 SQL 도구

`repo.event`, `existing`, `application`, `approvedCount`, `forEvent`, `history`는 조회 도구입니다. `insert`, `setStatus`, `addHistory`는 저장 도구이며 업무 권한이나 트랜잭션을 스스로 처리하지 않습니다. addHistory는 생성된 이력 ID를 반환합니다. 대기자 선택과 트랜잭션 처리는 직접 작성하며 필요하면 저장 함수를 확장할 수 있습니다.

SQLite UNIQUE(event_id,user_id)는 최종 중복 방어입니다. 서비스에서 일관된 409로 처리하세요. 참고 구현이나 특정 계정 ID에 맞춘 결과 하드코딩 없이 동일 정책을 모든 계정에 적용합니다.

## 검증

`npm test`는 제공 기반 4건, `npm run test:assignment`는 필수 T01~T32입니다. HTTP 응답과 DB 상태·이력을 함께 확인합니다. T28~T30은 테스트 DB 트리거로 이력 저장 실패를 주입하며 500과 전체 롤백을 기대합니다. 실패 후 정상 재시도도 확인합니다.

`npm run test:advanced`는 선택 심화로 동일 SQLite 파일을 사용하는 서버 프로세스 2개가 마지막 자리를 동시에 승인하는 상황을 20회 검사합니다. 필수인 트랜잭션 원자성과 선택인 동시성 검증을 구분하세요. 반복 검사 성공은 모든 경쟁 상황의 부재를 증명하지 않으므로 수행 시 보호 방식과 한계를 설명합니다.
