import { expect, test } from "bun:test";
import {
  extractResumeDocument,
  previewResume,
  validateResumeText,
  RESUME_MAX_BYTES,
} from "../../../packages/backend/src/modules/profiles/resume";
import { validateResumeExtraction } from "../../../packages/backend/src/modules/profiles/resume.schema";
import {
  applyResumeDraft,
  EMPTY_GUIDED,
  normalizeTechnologies,
  optionLabels,
  STACK,
} from "@repo/preferences";
import type { ModelGateway } from "../../../packages/backend/src/modules/ai/model-gateway";

const fixture = (name: string) =>
  Bun.file(new URL(`./fixtures/${name}`, import.meta.url));
const quote = (value: string, excerpt = value) => ({ value, excerpt });
export const extraction = {
  displayName: quote("Alex Rivera"),
  background: [quote("Built a cache service using TypeScript and PostgreSQL.")],
  languages: [quote("TypeScript"), quote("Python")],
  technologies: [quote("Node.js"), quote("PostgreSQL"), quote("Astro")],
  projects: [
    {
      name: quote("Cache service", "Project: Cache service"),
      technologies: [quote("TypeScript")],
      contribution: quote("Implemented expiry and cache invalidation."),
    },
  ],
};

test("real PDF and DOCX fixtures extract raw text without HTML", async () => {
  for (const format of ["pdf", "docx"] as const) {
    const result = await extractResumeDocument(
      format,
      await fixture(`resume.${format}`).arrayBuffer(),
    );
    expect(result.text).toContain("Alex Rivera");
    expect(result.text).toContain("Implemented expiry and cache invalidation.");
    expect(result.text).not.toContain("<w:");
    expect(
      validateResumeExtraction(extraction, result.text).draft,
    ).toMatchObject({
      displayName: "Alex Rivera",
      languages: ["typescript", "python"],
      stack: ["nodejs", "postgresql", "Astro"],
    });
  }
});

test("PDF page, encryption, unreadable text and malformed document errors are clear", async () => {
  for (const [file, code] of [
    ["too-many-pages.pdf", "RESUME_TOO_MANY_PAGES"],
    ["encrypted.pdf", "RESUME_ENCRYPTED"],
    ["encrypted-no-password.pdf", "RESUME_ENCRYPTED"],
    ["unreadable.pdf", "RESUME_UNREADABLE_PDF"],
  ]) {
    await expect(
      extractResumeDocument("pdf", await fixture(file!).arrayBuffer()),
    ).rejects.toMatchObject({ code });
  }
  await expect(
    extractResumeDocument(
      "docx",
      new TextEncoder().encode("PK broken document").buffer,
    ),
  ).rejects.toMatchObject({ code: "RESUME_MALFORMED" });
});

test("parser deadline and abort terminate non-cooperating workers and permit later imports", async () => {
  const workerUrl = new URL("./fixtures/stalled.worker.ts", import.meta.url);
  await expect(
    extractResumeDocument("pdf", new ArrayBuffer(1), undefined, {
      workerUrl,
      deadlineMs: 30,
    }),
  ).rejects.toMatchObject({ code: "RESUME_EXTRACTION_TIMEOUT" });
  const controller = new AbortController();
  const cancelled = extractResumeDocument(
    "docx",
    new ArrayBuffer(1),
    controller.signal,
    { workerUrl },
  );
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ code: "RESUME_CANCELLED" });
  const already = new AbortController();
  already.abort();
  await expect(
    extractResumeDocument("pdf", new ArrayBuffer(1), already.signal),
  ).rejects.toMatchObject({ code: "RESUME_CANCELLED" });
  expect(
    (
      await extractResumeDocument(
        "pdf",
        await fixture("resume.pdf").arrayBuffer(),
      )
    ).text,
  ).toContain("Alex Rivera");
});

test("source evidence is validated before technology alias normalization", async () => {
  const source = await fixture("resume.txt").text();
  expect(() =>
    validateResumeExtraction(
      {
        ...extraction,
        displayName: quote("Invented Name"),
        background: [],
        languages: [],
        technologies: [],
        projects: [],
      },
      source,
    ),
  ).toThrow("document evidence");
  expect(() =>
    validateResumeExtraction(
      {
        displayName: null,
        background: [],
        languages: [],
        projects: [],
        technologies: [
          quote("Rust", "Technologies: Node.js, PostgreSQL, Astro"),
        ],
      },
      source,
    ),
  ).toThrow("document evidence");
  expect(() =>
    validateResumeExtraction({ ...extraction, seniority: "senior" }, source),
  ).toThrow("document evidence");
  const aliased = validateResumeExtraction(
    {
      ...extraction,
      technologies: [quote("node", "I used node")],
      projects: [],
    },
    source + "\nI used node",
  );
  expect(aliased.draft.stack).toEqual(["nodejs"]);
});

test("evidence accepts document layout whitespace without accepting changed wording", async () => {
  const source = (await fixture("resume.txt").text())
    .replace(
      "Built a cache service using TypeScript and PostgreSQL.",
      "Built a cache\r\nservice using\tTypeScript and PostgreSQL.",
    )
    .replace(
      "Implemented expiry and cache invalidation.",
      "Implemented expiry\nand\u00a0cache\u2009invalidation.",
    );
  const draft = validateResumeExtraction(extraction, source).draft;
  expect(draft.projects[0]?.contribution).toBe(
    "Implemented expiry and cache invalidation.",
  );
  expect(draft.aboutMe).toBe(
    "Built a cache service using TypeScript and PostgreSQL.",
  );
  expect(
    validateResumeExtraction(
      {
        ...extraction,
        projects: [
          {
            ...extraction.projects[0]!,
            contribution: quote(
              "Implemented expiry\nand cache invalidation.",
              "Implemented expiry and cache invalidation.",
            ),
          },
        ],
      },
      source,
    ).draft.projects,
  ).toHaveLength(1);
  for (const value of [
    "Implemented expiry and cache replication.",
    "implemented expiry and cache invalidation.",
    "Implemented expiry and cache invalidation!",
  ]) {
    expect(() =>
      validateResumeExtraction(
        {
          displayName: null,
          background: [],
          languages: [],
          technologies: [],
          projects: [
            { ...extraction.projects[0]!, contribution: quote(value) },
          ],
        },
        source,
      ),
    ).toThrow("document evidence");
  }
});

test("evidence accepts canonically equivalent Unicode characters", () => {
  const raw = {
    displayName: quote("Jos\u00e9 Example"),
    background: [],
    languages: [],
    technologies: [],
    projects: [],
  };
  expect(
    validateResumeExtraction(raw, "Jose\u0301 Example").draft.displayName,
  ).toBe("Jos\u00e9 Example");
});

test("PDF evidence accepts omitted list bullets and wrapped hyphen spacing", () => {
  const contribution =
    "Built an offline desktop app. Added user-scoped storage and PDF invoices.";
  const raw = {
    displayName: null,
    background: [],
    languages: [],
    technologies: [],
    projects: [
      {
        name: quote("Billing app"),
        technologies: [],
        contribution: quote(
          contribution,
          "Built an offline desktop app. Added user- scoped storage and PDF invoices.",
        ),
      },
    ],
  };
  for (const bullet of ["●", "•", "▪"]) {
    const source = `Project: Billing app\n${bullet} Built an offline desktop app.\n${bullet} Added user-\nscoped storage and PDF invoices.`;
    expect(validateResumeExtraction(raw, source)).toEqual({
      draft: {
        displayName: null,
        aboutMe: null,
        languages: [],
        stack: [],
        projects: [{ name: "Billing app", technologies: [], contribution }],
      },
      warnings: [],
    });
  }
});

test("partial extraction retains verified details, excludes unsupported fields, and warns", () => {
  const raw = {
    displayName: quote("Invented Name"),
    background: [quote("Built a useful developer tool.")],
    languages: [quote("Python"), quote("Rust", "Languages: Python")],
    technologies: [quote("Kubernetes")],
    projects: [
      {
        name: quote("Voice app"),
        technologies: [
          quote("Drizzle ORM", "Used Drizzle for storage."),
          quote("React"),
        ],
        contribution: quote("Built voice input with React."),
      },
      {
        name: quote("Unstated project"),
        technologies: [],
        contribution: quote("Built a useful developer tool."),
      },
      {
        name: quote("Incomplete project"),
        technologies: [],
        contribution: quote("Invented contribution."),
      },
    ],
  };
  const source =
    "Built a useful developer tool.\nLanguages: Python\nProject: Voice app\nUsed Drizzle for storage.\nBuilt voice input with React.\nProject: Incomplete project";
  const result = validateResumeExtraction(raw, source);
  expect(result.draft).toEqual({
    displayName: null,
    aboutMe: "Built a useful developer tool.",
    languages: ["python"],
    stack: [],
    projects: [
      {
        name: "Voice app",
        technologies: ["react"],
        contribution: "Built voice input with React.",
      },
    ],
  });
  expect(result.warnings).toEqual([expect.stringContaining("left out")]);
});

test("formatting normalization preserves internal bullet characters and rejects changed claims", () => {
  for (const [source, value] of [
    ["Uses • as a delimiter.", "Uses as a delimiter."],
    ["Built user-scoped storage.", "Built userscoped storage."],
    [
      "Built storage with no cloud service.",
      "Built storage with a cloud service.",
    ],
  ]) {
    expect(() =>
      validateResumeExtraction(
        {
          displayName: null,
          background: [quote(value!)],
          languages: [],
          technologies: [],
          projects: [],
        },
        source!,
      ),
    ).toThrow("document evidence");
  }
});

test("pasted text and multipart inputs obey only resume-specific limits", async () => {
  let calls = 0;
  const llm = {
    extractResume: async () => {
      calls++;
      return extraction;
    },
  } as unknown as ModelGateway;
  const source = await fixture("resume.txt").text();
  const input = (text: string) =>
    new Request("http://localhost/profiles/resume/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  expect(
    (await previewResume(input(source), "owner", llm)).draft.displayName,
  ).toBe("Alex Rivera");
  for (const text of ["short", "x".repeat(100001)])
    await expect(
      previewResume(input(text), "owner", llm),
    ).rejects.toMatchObject({ code: "RESUME_TEXT_LENGTH" });
  for (const [name, content, code] of [
    ["resume.txt", source, "RESUME_UNSUPPORTED_FORMAT"],
    ["resume.pdf", source, "RESUME_MALFORMED"],
    ["resume.pdf", "x".repeat(RESUME_MAX_BYTES + 1), "RESUME_TOO_LARGE"],
  ]) {
    const form = new FormData();
    form.append("file", new File([content!], name!));
    await expect(
      previewResume(
        new Request("http://localhost", { method: "POST", body: form }),
        "owner",
        llm,
      ),
    ).rejects.toMatchObject({ code });
  }
  expect(calls).toBe(1);
  expect(validateResumeText("x".repeat(40))).toHaveLength(40);
  expect(validateResumeText("x".repeat(100000))).toHaveLength(100000);
});

test("import application selects fields, merges aliases and custom entries, and leaves original values intact", () => {
  const form = {
    ...EMPTY_GUIDED,
    displayName: "Existing",
    aboutMe: "Existing background",
    languages: ["typescript"],
    stack: ["Astro"],
    projects: [
      { name: "Cache", technologies: ["Node.js"], contribution: "Built cache" },
    ],
  };
  const draft = {
    displayName: "Alex",
    aboutMe: "Replacement",
    languages: ["ts", "Clojure"],
    stack: ["astro", "Postgres"],
    projects: [
      { name: "Cache", technologies: ["nodejs"], contribution: "Built cache" },
      { name: "Other", technologies: ["Zig"], contribution: "Built another" },
    ],
  };
  const result = applyResumeDraft(form, draft, [
    "aboutMe",
    "languages",
    "stack",
    "projects",
  ]);
  expect(result.displayName).toBe("Existing");
  expect(result.aboutMe).toBe("Replacement");
  expect(result.languages).toEqual(["typescript", "Clojure"]);
  expect(result.stack).toEqual(["Astro", "postgresql"]);
  expect(result.projects).toHaveLength(2);
  expect(form.projects).toHaveLength(1);
  expect(form.aboutMe).toBe("Existing background");
  expect(applyResumeDraft(form, draft, [])).toEqual(form);
  expect(
    normalizeTechnologies([
      "TS",
      "TypeScript",
      "C++",
      "cpp",
      "My tool",
      "my TOOL",
    ]),
  ).toEqual(["typescript", "cpp", "My tool"]);
  expect(optionLabels(STACK, ["postgresql", "My tool"])).toEqual([
    "PostgreSQL",
    "My tool",
  ]);
});
