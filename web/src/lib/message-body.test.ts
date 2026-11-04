import { describe, expect, test } from 'bun:test'
import {
  canSubmitMessage,
  MAX_MESSAGE_LENGTH,
  normalizeMessageBody,
} from './message-body'

describe('normalizeMessageBody', () => {
  test('前後の空白(全角スペース、タブ、改行を含む)を取り除く', () => {
    expect(normalizeMessageBody('  \u3000 本文 \t\n')).toBe('本文')
  })

  test('途中の空白と改行は保たれる', () => {
    expect(normalizeMessageBody('一行目\n二行目  あり')).toBe(
      '一行目\n二行目  あり',
    )
  })
})

describe('canSubmitMessage', () => {
  test('空・空白だけは送れない', () => {
    for (const text of ['', '   ', '\u3000\u3000', '\t\n ', '\r\n']) {
      expect(canSubmitMessage(text)).toBe(false)
    }
  })

  test('本文があれば送れる', () => {
    expect(canSubmitMessage('確認お願いします')).toBe(true)
    expect(canSubmitMessage('  前後に空白  ')).toBe(true)
  })

  test('上限ちょうどは送れて、1 文字超えると送れない', () => {
    expect(canSubmitMessage('あ'.repeat(MAX_MESSAGE_LENGTH))).toBe(true)
    expect(canSubmitMessage('あ'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false)
  })

  test('上限は、取り除く前の長さで判定する(前後の空白込みで超えると送れない)', () => {
    expect(canSubmitMessage(' ' + 'あ'.repeat(MAX_MESSAGE_LENGTH))).toBe(false)
  })

  test('絵文字は UTF-16 の長さで数える(1 つで 2)', () => {
    expect(canSubmitMessage('👍'.repeat(MAX_MESSAGE_LENGTH / 2))).toBe(true)
    expect(canSubmitMessage('👍'.repeat(MAX_MESSAGE_LENGTH / 2 + 1))).toBe(false)
  })
})