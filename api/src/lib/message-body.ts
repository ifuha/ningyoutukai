/**
 * メッセージ本文の上限(UTF-16 の長さ。trim 前で判定する)。
 * docs/v2.0/message-feature.md の Q10 の案。コメント・完了報告・差し戻し・承認で共有する
 * (web の `lib/message-body.ts` の `MAX_MESSAGE_LENGTH` と同じ値)
 */
export const MAX_BODY_LENGTH = 2000;

/** 本文のスキーマ。NUL 文字は入れられない(ターミナルや DB に困るため) */
export const bodySchema = (maxLength: number) =>
  ({ maxLength, pattern: "^[^\\u0000]*$" }) as const;
