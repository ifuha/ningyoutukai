// セクションの色。Figma の `section-*`(red / yellow / green / purple / lightblue / blue)と同じ 6 つ。
// DB に触れない小さなモジュール。スキーマ(CHECK の一覧)と API(入力の検証)が、ここから import する。
export const sectionColors = ["red", "yellow", "green", "purple", "lightblue", "blue"] as const;
export type SectionColor = (typeof sectionColors)[number];
