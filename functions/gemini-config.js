/** Central Gemini free-tier config. Change quotas here only. */

export const FREE_ONLY = true;

export const QUOTA_THRESHOLD = 0.9;

export const ESTIMATED_INPUT_TOKENS_PER_IMAGE = 4000;

export const ESTIMATED_OUTPUT_TOKENS = 1024;

export const TEMP_UNAVAILABLE_RETRIES = 2;

export const TEMP_UNAVAILABLE_BASE_MS = 400;

/** Pacific Time — Gemini free-tier RPD reset. */
export const QUOTA_TIME_ZONE = "America/Los_Angeles";

export const GEMINI_MODEL_CONFIG = {
  "gemini-3.5-flash-lite": { priority: 1, rpm: 15, tpm: 250000, rpd: 500 },
  "gemini-3.1-flash-lite": { priority: 2, rpm: 15, tpm: 250000, rpd: 500 },
  "gemini-3.7-flash": { priority: 3, rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-3.6-flash": { priority: 4, rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-3.5-flash": { priority: 5, rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-3-flash-preview": { priority: 6, rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-2.5-flash": { priority: 7, rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-2.5-flash-lite": { priority: 8, rpm: 10, tpm: 250000, rpd: 20 },
};

export const FREE_MODELS = Object.entries(GEMINI_MODEL_CONFIG)
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([id]) => id);

export const TASK_PROMPT = [
  "画像内の手書きToDoリストを認識してください。",
  "人間が別々のタスクとして認識する各ブロックを1つのtaskとして抽出してください。",
  "箇条書き記号、チェックボックス、番号などの装飾的な記号は原則削除してください。",
  "1つのタスクが複数行にまたがる場合は1つのtaskにまとめてください。",
  "内容を要約、言い換え、追加、創作しないでください。",
  "タスク本文に意味のある数字や記号が含まれる場合は保持してください。",
  "書かれていないタスクを追加しないでください。",
  "読み取れる文字が全くない場合は tasks を空配列にして empty を true にしてください。",
  "画像全体の文字のうち約8割以上が判読不能なときだけ lowConfidence を true にしてください。一部の文字が読みにくいだけでは false です。",
  "Respond with JSON only.",
].join("\n");

export const NOTE_PROMPT = [
  "画像内の手書きメモをできるだけ忠実に文字起こししてください。",
  "要約、言い換え、文章の修正、内容の補完をしないでください。",
  "改行、段落、箇条書きなど、画像内の構造を可能な限り維持してください。",
  "読めない文字を根拠なく創作しないでください。",
  "数式がある場合は latex 配列に LaTeX ソースを入れてください（$ 記号は付けない）。本文 text には数式の位置に [[MATH:n]] と書いてください（n は 0 始まりの latex インデックス）。",
  "読み取れる文字が全くない場合は text を空文字、empty を true にしてください。",
  "画像全体の文字のうち約8割以上が判読不能なときだけ lowConfidence を true にしてください。一部の文字が読みにくいだけでは false です。",
  "Respond with JSON only.",
].join("\n");

export const TASK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    tasks: { type: "array", items: { type: "string" } },
    empty: { type: "boolean" },
    lowConfidence: { type: "boolean" },
  },
  required: ["tasks"],
};

export const NOTE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    latex: { type: "array", items: { type: "string" } },
    empty: { type: "boolean" },
    lowConfidence: { type: "boolean" },
  },
  required: ["text"],
};

export function estimatedTokensForRequest() {
  return ESTIMATED_INPUT_TOKENS_PER_IMAGE + ESTIMATED_OUTPUT_TOKENS;
}
