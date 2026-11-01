import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { JevError, jev, type JevRequest } from "../../src/lib/jev";

// Jev の呼び出し(fetch を差し替える。本物の API は呼ばない)

const request: JevRequest = {
  state: { x: 1 },
  questions: { t1: { type: "choice", instructions: "どっち", criteria: { m1: "", m2: "" } } },
};
const okBody = {
  model: "jev-1.14.0",
  answers: { t1: { type: "choice", choice: "m1", confidence: 0.9, probabilities: { m1: 0.9, m2: 0.1 } } },
  usage: { input_tokens: 5, output_tokens: 1 },
};
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });

const saved = { key: process.env.TYPESAFE_API_KEY, model: process.env.JEV_MODEL, url: process.env.JEV_API_URL };
let fetchSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  process.env.TYPESAFE_API_KEY = "test-key";
  delete process.env.JEV_MODEL;
  delete process.env.JEV_API_URL;
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  fetchSpy?.mockRestore();
  errorSpy.mockRestore();
  for (const [name, value] of [["TYPESAFE_API_KEY", saved.key], ["JEV_MODEL", saved.model], ["JEV_API_URL", saved.url]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const kind = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof JevError ? e.kind : "other";
  }
  return "none";
};

describe("jev.ask", () => {
  it("ベアラートークンつきで POST し、モデルの版・state・questions を送る", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(json(okBody));
    const response = await jev.ask(request);
    expect(response.answers.t1).toMatchObject({ choice: "m1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init as RequestInit).method).toBe("POST");
    expect(new Headers((init as RequestInit).headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ model: "jev-1.14.0", ...request });
  });

  it("JEV_MODEL でモデルを、JEV_API_URL で接続先を変えられる", async () => {
    process.env.JEV_MODEL = "jev-1.13.0";
    process.env.JEV_API_URL = "http://localhost:9999/v1/systemone";
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(json(okBody));
    await jev.ask(request);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:9999/v1/systemone");
    expect(JSON.parse(String((init as RequestInit).body)).model).toBe("jev-1.13.0");
  });

  it("キーが未設定(空も)なら、呼ばずに not-configured", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(json(okBody));
    delete process.env.TYPESAFE_API_KEY;
    expect(await kind(jev.ask(request))).toBe("not-configured");
    process.env.TYPESAFE_API_KEY = "";
    expect(await kind(jev.ask(request))).toBe("not-configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("429 は retry-after に従って 1 回だけやり直す", async () => {
    fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(json(okBody));
    const response = await jev.ask(request);
    expect(response.model).toBe("jev-1.14.0");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("やり直しても 429 なら rate-limited(それ以上は繰り返さない)", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () =>
      new Response("slow down", { status: 429, headers: { "retry-after": "0" } })) as unknown as typeof fetch);
    expect(await kind(jev.ask(request))).toBe("rate-limited");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("4xx・5xx は upstream。応答の本文は利用者に見せない(ログにだけ出す)", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("secret detail", { status: 500 }));
    const error = await jev.ask(request).catch((e) => e);
    expect(error).toBeInstanceOf(JevError);
    expect(error.kind).toBe("upstream");
    expect(error.message).not.toContain("secret detail");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("接続できない・タイムアウトも JevError にする", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await kind(jev.ask(request))).toBe("upstream");
    fetchSpy.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect(await kind(jev.ask(request))).toBe("timeout");
  });

  it("応答の形が違えば upstream", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(json({ nothing: true }));
    expect(await kind(jev.ask(request))).toBe("upstream");
  });
});
