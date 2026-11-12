export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const missing = (what='대상') => new AppError(404,'NOT_FOUND',`${what}을 찾을 수 없습니다.`);
export const forbidden = () => new AppError(403,'FORBIDDEN','이 작업을 수행할 권한이 없습니다.');
export const invalidState = () => new AppError(409,'INVALID_STATE','현재 상태에서는 이 작업을 수행할 수 없습니다.');
