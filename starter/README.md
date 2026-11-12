# ApplyFlow 실행 안내

프로젝트 개요, 요구사항별 구현, 전체 검증 결과와 화면 증거는 저장소 루트의 [README.md](../README.md)에 정리되어 있습니다. GitHub 저장소 첫 화면에서도 같은 구현 안내를 확인할 수 있습니다.

## 실행 방법

Node.js **24.x**와 npm이 필요합니다. 이 폴더에서 아래 명령을 실행합니다.

```bash
npm ci
npm test
npm run test:assignment
npm run test:advanced
npm start
```

브라우저에서 <http://127.0.0.1:3000>을 엽니다. DB를 초기화하려면 서버를 종료한 뒤 `npm run db:reset`을 실행하고 `RESET`을 입력합니다.

연습 계정은 `alice`, `bob`, `charlie`, `manager1`, `manager2`이며 모두 가상 계정이고 비밀번호는 `Classroom123!`입니다.

- [API 안내](docs/API.md)
- [보고서 PDF](docs/202413123.pdf)
- [테스트 결과](docs/evidence/test-results.md)
- [화면 검증 기록](docs/evidence/screen-verification.md)
- [검증 캡처](docs/evidence/screenshots/)
