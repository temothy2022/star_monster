import { useMemo, useState, type CSSProperties } from "react";
import {
  MATH_QUESTION_CATEGORIES,
  MATH_QUESTION_TYPES,
  generateMathWorksheet,
  getMathQuestionTypesByCategory,
  type MathQuestion,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";
import { useMascot } from "../mascots";
import { MathVisual } from "./MathVisual";
import "./math-practice.css";
import "./math-worksheet-print.css";

type TypeCounts = Partial<Record<MathQuestionTypeId, number>>;
type NumberedQuestion = {
  number: number;
  question: MathQuestion;
  paperTopMm?: number;
  paperColumn?: 1 | 2;
};

const MAX_PER_TYPE = 20;
const MAX_TOTAL = 120;
const DEFAULT_COUNTS: TypeCounts = {
  N01: 1,
  N06: 1,
  C07: 2,
  V01: 1,
  W01: 1,
  S04: 1,
};

function clampCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PER_TYPE, Math.round(value)));
}

type PaperQuestionSize =
  | "compact"
  | "number-strip"
  | "sort"
  | "standard"
  | "tall-visual"
  | "wide-visual"
  | "fact-family"
  | "logic";

type PaperQuestionLayout = {
  heightMm: number;
  size: PaperQuestionSize;
  wide: boolean;
};

const WORKSHEET_FIRST_PAGE_BODY_HEIGHT_MM = 244;
const WORKSHEET_CONTINUATION_BODY_HEIGHT_MM = 262;
const WORKSHEET_ROW_GAP_MM = 4;
const MAX_PAIRED_HEIGHT_DIFFERENCE_MM = 12;

export function getPaperQuestionLayout(question: MathQuestion): PaperQuestionLayout {
  if (question.typeId === "S03") {
    const rowCount = question.visual.kind === "LOGIC_GRID" ? question.visual.rows.length : 4;
    return { heightMm: Math.max(104, Math.min(120, 76 + rowCount * 7)), size: "logic", wide: true };
  }
  if (question.typeId === "V07") return { heightMm: 104, size: "fact-family", wide: true };
  if (question.typeId === "N02") return { heightMm: 82, size: "wide-visual", wide: true };
  if (question.typeId === "N15") return { heightMm: 82, size: "wide-visual", wide: true };
  if (question.typeId === "N16") return { heightMm: 104, size: "wide-visual", wide: true };
  if (question.visual.kind === "ARITHMETIC_LIST") {
    const rows = question.visual.items.length;
    // Arithmetic exercises can contain several independent rows.  Their card
    // height must be derived from the row count so the last row never gets
    // clipped by the fixed-height paper card.  Keep the calculation generous
    // enough for the wrapped prompt, card padding and row gaps; the generator
    // caps each type at 20 items, so 240mm remains within one A4 body.
    return { heightMm: Math.min(240, Math.max(66, 25 + rows * 11)), size: "compact", wide: false };
  }
  if (["C01", "C02", "C03", "C04", "C06", "N08"].includes(question.typeId)) {
    return { heightMm: 42, size: "compact", wide: false };
  }
  if (["N06", "N07"].includes(question.typeId)) {
    return { heightMm: 52, size: "number-strip", wide: false };
  }
  if (question.typeId === "N09") return { heightMm: 62, size: "sort", wide: false };
  if (["S02", "S04", "C05", "P01", "P02", "P05", "P06", "P07"].includes(question.typeId)) {
    return { heightMm: 84, size: "tall-visual", wide: false };
  }
  if (question.typeId.startsWith("W")) return { heightMm: 86, size: "tall-visual", wide: false };
  return { heightMm: 76, size: "standard", wide: false };
}

export function paginateWorksheetQuestions(questions: readonly MathQuestion[]) {
  type QuestionGroup = {
    questions: MathQuestion[];
    heightMm: number;
    firstSeen: number;
  };

  // The generator intentionally mixes question types. A paper works better when
  // each type becomes a short exercise block, while retaining the type's own
  // easy-to-hard order from the generator.
  const groupsByType = new Map<MathQuestionTypeId, QuestionGroup>();
  questions.forEach((question, index) => {
    const existing = groupsByType.get(question.typeId);
    if (existing) {
      existing.questions.push(question);
      return;
    }
    const layout = getPaperQuestionLayout(question);
    groupsByType.set(question.typeId, {
      questions: [question],
      heightMm: layout.heightMm,
      firstSeen: index,
    });
  });

  // The first-seen tie breaker keeps the seeded random variety between papers,
  // but height is the primary order so visually compatible cards meet each other.
  const groups = [...groupsByType.values()].sort((left, right) =>
    left.heightMm - right.heightMm || left.firstSeen - right.firstSeen,
  );
  const orderedQuestions = groups.flatMap((group) => group.questions);
  const pages: NumberedQuestion[][] = [];
  let currentPage: NumberedQuestion[] = [];
  let columnBottoms: [number, number] = [0, 0];
  let questionNumber = 1;

  const nextTop = (columnBottom: number) => columnBottom === 0 ? 0 : columnBottom + WORKSHEET_ROW_GAP_MM;
  const pageBodyHeight = () => pages.length === 0
    ? WORKSHEET_FIRST_PAGE_BODY_HEIGHT_MM
    : WORKSHEET_CONTINUATION_BODY_HEIGHT_MM;
  const startNewPage = () => {
    if (currentPage.length > 0) pages.push(currentPage);
    currentPage = [];
    columnBottoms = [0, 0];
  };
  const placeNarrow = (question: MathQuestion, column: 0 | 1, topMm: number) => {
    const heightMm = getPaperQuestionLayout(question).heightMm;
    currentPage.push({
      number: questionNumber++,
      question,
      paperTopMm: topMm,
      paperColumn: column === 0 ? 1 : 2,
    });
    columnBottoms[column] = topMm + heightMm;
  };
  const placeWide = (question: MathQuestion, topMm: number) => {
    const heightMm = getPaperQuestionLayout(question).heightMm;
    currentPage.push({ number: questionNumber++, question, paperTopMm: topMm, paperColumn: 1 });
    columnBottoms = [topMm + heightMm, topMm + heightMm];
  };

  for (let index = 0; index < orderedQuestions.length;) {
    const question = orderedQuestions[index]!;
    const layout = getPaperQuestionLayout(question);

    if (layout.wide) {
      let topMm = Math.max(nextTop(columnBottoms[0]), nextTop(columnBottoms[1]));
      if (topMm + layout.heightMm > pageBodyHeight() && currentPage.length > 0) {
        startNewPage();
        topMm = 0;
      }
      placeWide(question, topMm);
      index += 1;
      continue;
    }

    const nextQuestion = orderedQuestions[index + 1];
    const nextLayout = nextQuestion ? getPaperQuestionLayout(nextQuestion) : null;
    const columnsNearlyAligned = Math.abs(columnBottoms[0] - columnBottoms[1]) <= MAX_PAIRED_HEIGHT_DIFFERENCE_MM;
    const canPair = Boolean(nextQuestion && nextLayout && !nextLayout.wide && columnsNearlyAligned &&
      Math.abs(layout.heightMm - nextLayout.heightMm) <= MAX_PAIRED_HEIGHT_DIFFERENCE_MM);

    if (canPair && nextQuestion && nextLayout) {
      let topMm = Math.max(nextTop(columnBottoms[0]), nextTop(columnBottoms[1]));
      if (topMm + Math.max(layout.heightMm, nextLayout.heightMm) > pageBodyHeight() && currentPage.length > 0) {
        startNewPage();
        topMm = 0;
      }
      placeNarrow(question, 0, topMm);
      placeNarrow(nextQuestion, 1, topMm);
      index += 2;
      continue;
    }

    let column: 0 | 1 = columnBottoms[0] <= columnBottoms[1] ? 0 : 1;
    let topMm = nextTop(columnBottoms[column]);
    if (topMm + layout.heightMm > pageBodyHeight()) {
      const otherColumn: 0 | 1 = column === 0 ? 1 : 0;
      const otherTopMm = nextTop(columnBottoms[otherColumn]);
      if (otherTopMm + layout.heightMm <= pageBodyHeight()) {
        column = otherColumn;
        topMm = otherTopMm;
      } else if (currentPage.length > 0) {
        startNewPage();
        column = 0;
        topMm = 0;
      }
    }
    placeNarrow(question, column, topMm);
    index += 1;
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

function chunkAnswers(questions: readonly NumberedQuestion[], size = 24) {
  return Array.from(
    { length: Math.ceil(questions.length / size) },
    (_, index) => questions.slice(index * size, (index + 1) * size),
  );
}

function EquationBlanks({ question }: { question: MathQuestion }) {
  const response = question.response;
  if (response.equationRows && response.equationSlotsPerRow) {
    return (
      <div className="math-paper-fact-family">
        {Array.from({ length: response.equationRows }, (_, row) => (
          <div key={row}>
            <i /><i /><i /><b>=</b><i />
          </div>
        ))}
      </div>
    );
  }
  if (!response.template) return null;
  return (
    <div className="math-paper-equation">
      {response.template.split(/(\{\d+\})/g).filter(Boolean).map((part, index) => (
        /^\{\d+\}$/.test(part)
          ? <i key={`${part}-${index}`} />
          : <b key={`${part}-${index}`}>{part}</b>
      ))}
    </div>
  );
}

function PaperResponse({ question }: { question: MathQuestion }) {
  // These exercises already contain their own answer area in the prompt or
  // illustration. P01/P02 are picture-to-number exercises, so they need a
  // handwritten answer line on paper even though the screen uses a keypad.
  if (["S03", "N09", "N04", "N05", "N15", "N16", "P03", "P04", "P06", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14"].includes(question.typeId)) return null;
  if (question.response.mode === "R04") return <EquationBlanks question={question} />;
  const options = question.response.options ?? [];
  if (options.length > 0 && question.response.mode !== "R03") {
    return (
      <div className="math-paper-options">
        {options.map((option) => <span key={option}><i />{option}</span>)}
      </div>
    );
  }
  if (question.response.mode === "R03" && question.helper?.includes("○")) {
    return <div className="math-paper-hint">把答案写在圆圈里</div>;
  }
  const slots = Math.max(1, question.response.slots ?? question.answer.values.length);
  return (
    <div className="math-paper-answer-line">
      <b>答：</b>
      {Array.from({ length: slots }, (_, index) => (
        <span key={index}>
          {question.response.slotLabels?.[index] ? <small>{question.response.slotLabels[index]}</small> : null}
          <i />
        </span>
      ))}
    </div>
  );
}

function paperPrompt(question: MathQuestion) {
  switch (question.typeId) {
    case "N09":
      return "把下面的数按从小到大的顺序排列。";
    case "N16": {
      if (question.visual.kind !== "COUNT_ADJUST") return question.prompt;
      return `先数一数参考框里的物品，在作答框里画出比它${question.visual.relation === "MORE" ? "多" : "少"} ${question.visual.difference} 个的数量。`;
    }
    case "P01":
      return "看图写出数字。";
    case "P06": {
      const beadCount = question.prompt.match(/把 (\d+) 颗珠子/)?.[1] ?? "";
      return `用 ${beadCount} 颗珠子表示所有可能的数：在每个计数器上画出珠子，再写出表示的数。`;
    }
    case "S03":
      return "根据下面的条件，在表格中给每个小伙伴打“√”（每行只选一个）。";
    default:
      return question.prompt;
  }
}

function SortOnPaper({ question }: { question: MathQuestion }) {
  const options = question.response.options ?? [];
  return (
    <div className="math-paper-sort">
      <div>{options.map((option) => <b key={option}>{option}</b>)}</div>
      <p>{options.map((_, index) => <span key={index}><i />{index < options.length - 1 ? "<" : ""}</span>)}</p>
    </div>
  );
}

function ConstructQuantityOnPaper({ question }: { question: MathQuestion }) {
  if (question.visual.kind !== "COUNT_ADJUST") return null;
  return (
    <div className="math-paper-construct-quantity">
      <div className="math-paper-visual math-paper-visual--count-adjust">
        <div className="math-visual-board">
          <MathVisual question={question} disabled />
        </div>
      </div>
      <div className="math-paper-drawing-line">
        <b>请在这里画：</b><span />
      </div>
    </div>
  );
}

function AbacusBuildOnPaper({ question }: { question: MathQuestion }) {
  const count = question.answer.values.length;
  return (
    <div className="math-paper-abacus-build">
      <div className="math-paper-abacus-build__items">
        {Array.from({ length: count }, (_, index) => (
          <div key={index}>
            <div className="math-paper-mini-abacus">
              <span><i /><i /><i /><i /></span>
              <span><i /><i /><i /><i /></span>
              <b>十位　个位</b>
            </div>
            <label>写数：<i /></label>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaperQuestion({ item }: { item: NumberedQuestion }) {
  const { number, question } = item;
  const layout = getPaperQuestionLayout(question);
  const style = {
    "--math-paper-question-height": `${layout.heightMm}mm`,
    top: `calc(5mm + ${item.paperTopMm ?? 0}mm)`,
    left: layout.wide || item.paperColumn === 1 ? 0 : "calc(50% + 2mm)",
    width: layout.wide ? "100%" : "calc(50% - 2mm)",
  } as CSSProperties;
  return (
    <article
      className={`math-paper-question math-paper-question--${layout.size}${layout.wide ? " math-paper-question--wide" : ""}`}
      data-question-type={question.typeId}
      style={style}
    >
      <header>
        <span>{number}</span>
      <h2>{paperPrompt(question)}</h2>
      </header>
      {question.typeId === "N09" ? <SortOnPaper question={question} /> : question.typeId === "N16" ? <ConstructQuantityOnPaper question={question} /> : question.typeId === "P06" ? <AbacusBuildOnPaper question={question} /> : (
        <div className={`math-paper-visual math-paper-visual--${question.visual.kind.toLowerCase()}`}>
          <div className="math-visual-board">
            <MathVisual question={question} disabled />
          </div>
        </div>
      )}
      <PaperResponse question={question} />
    </article>
  );
}

function MathPaperMascot({ mood = "neutral" }: { mood?: "neutral" | "focus" | "celebrate" }) {
  const { mascot } = useMascot();
  return <img src={mascot.images[mood]} alt="" />;
}

function PaperHeader({ title, answerKey = false }: { title: string; answerKey?: boolean }) {
  return (
    <header className="math-paper-header">
      <div>
        <MathPaperMascot />
        <span><small>星宠数学练习</small><strong>{answerKey ? `${title} - 参考答案` : title}</strong></span>
      </div>
      {answerKey ? <b>请家长单独保管</b> : (
        <p><span>姓名：________________</span><span>日期：________________</span></p>
      )}
    </header>
  );
}

function WorksheetPage({
  title,
  items,
  pageNumber,
  totalPages,
}: {
  title: string;
  items: NumberedQuestion[];
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <section className="math-print-page" data-math-pdf-page="worksheet">
      {pageNumber === 1 ? <PaperHeader title={title} /> : null}
      <div className="math-paper-question-grid">
        {items.map((item) => <PaperQuestion item={item} key={item.number} />)}
      </div>
      <footer>练习卷 · 第 {pageNumber} / {totalPages} 页</footer>
    </section>
  );
}

function AnswerPage({
  title,
  items,
  pageNumber,
  totalPages,
}: {
  title: string;
  items: NumberedQuestion[];
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <section className="math-print-page math-print-page--answers" data-math-pdf-page="answers">
      <PaperHeader title={title} answerKey />
      <div className="math-paper-answer-grid">
        {items.map(({ number, question }) => (
          <div key={number}>
            <b>{number}</b>
            <span>{question.answer.display}</span>
          </div>
        ))}
      </div>
      <footer>参考答案 · 第 {pageNumber} / {totalPages} 页</footer>
    </section>
  );
}

function safeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 40) || "数学练习卷";
}

async function waitForPageImages(page: HTMLElement) {
  await document.fonts?.ready;
  await Promise.all(Array.from(page.querySelectorAll("img")).map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
  )));
}

export function MathWorksheetPrintPage() {
  const [title, setTitle] = useState("数学练习");
  const [counts, setCounts] = useState<TypeCounts>(DEFAULT_COUNTS);
  const [seed, setSeed] = useState(20260810);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [exportProgress, setExportProgress] = useState("");
  const [error, setError] = useState("");
  const questions = useMemo(() => generateMathWorksheet(counts, seed), [counts, seed]);
  const worksheetPages = useMemo(() => paginateWorksheetQuestions(questions), [questions]);
  const arrangedQuestions = useMemo(() => worksheetPages.flat(), [worksheetPages]);
  const answerPages = useMemo(() => includeAnswers ? chunkAnswers(arrangedQuestions) : [], [arrangedQuestions, includeAnswers]);
  const totalPdfPages = worksheetPages.length + answerPages.length;

  function updateCount(typeId: MathQuestionTypeId, value: number) {
    const next = clampCount(value);
    setCounts((current) => {
      const currentTotal = Object.values(current).reduce<number>((sum, count) => sum + (count ?? 0), 0);
      const availableForType = MAX_TOTAL - currentTotal + (current[typeId] ?? 0);
      const allowed = Math.min(next, availableForType);
      const updated = { ...current };
      if (allowed === 0) delete updated[typeId];
      else updated[typeId] = allowed;
      return updated;
    });
  }

  function selectEveryType() {
    setCounts(Object.fromEntries(MATH_QUESTION_TYPES.map((type) => [type.id, 1])) as TypeCounts);
  }

  function toggleCategory(categoryId: string) {
    setCollapsedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  }

  async function downloadPdf() {
    if (questions.length === 0 || exportProgress) return;
    setError("");
    try {
      const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-math-pdf-page]"));
      if (pages.length === 0) throw new Error("练习卷还没有准备好");
      setExportProgress("正在准备 PDF…");
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      pdf.setProperties({ title: safeFilename(title), subject: "A4 数学练习卷" });
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]!;
        setExportProgress(`正在生成第 ${index + 1} / ${pages.length} 页…`);
        await waitForPageImages(page);
        const canvas = await html2canvas(page, {
          backgroundColor: "#ffffff",
          logging: false,
          scale: 2,
          useCORS: true,
          width: page.scrollWidth,
          height: page.scrollHeight,
          windowWidth: Math.max(document.documentElement.clientWidth, page.scrollWidth),
          windowHeight: Math.max(document.documentElement.clientHeight, page.scrollHeight),
        });
        if (index > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(canvas, "JPEG", 0, 0, 210, 297, undefined, "FAST");
        canvas.width = 1;
        canvas.height = 1;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const now = new Date();
      const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      pdf.save(`${safeFilename(title)}-${date}.pdf`);
      setExportProgress("PDF 已生成");
      window.setTimeout(() => setExportProgress(""), 1500);
    } catch (reason) {
      setExportProgress("");
      setError(reason instanceof Error ? reason.message : "PDF 生成失败，请重试");
    }
  }

  return (
    <main className="math-worksheet-builder">
      <header className="math-worksheet-builder__topbar">
        <a href="#pages">← 返回</a>
        <div><MathPaperMascot /><span><small>无需登录 · 打开即用</small><strong>A4 数学练习卷</strong></span></div>
        <b>{questions.length} 道题 · {totalPdfPages} 页 PDF</b>
      </header>

      <section className="math-worksheet-builder__workspace">
        <aside className="math-worksheet-config">
          <div className="math-worksheet-config__heading">
            <div><h1>选择题型和数量</h1><p>每种题型最多 {MAX_PER_TYPE} 道，单套最多 {MAX_TOTAL} 道，题目会自动按难度配比。</p></div>
            <div><button type="button" onClick={selectEveryType}>全部各 1 题</button><button type="button" onClick={() => setCounts({})}>清空</button></div>
          </div>

          <label className="math-worksheet-title-field">
            <span>练习卷标题</span>
            <input value={title} maxLength={24} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <div className="math-worksheet-type-list">
            {MATH_QUESTION_CATEGORIES.map((domain, categoryIndex) => (
              <section key={domain.id} className={collapsedCategories[domain.id] ? "is-collapsed" : ""}>
                <button
                  type="button"
                  className="math-worksheet-category-toggle"
                  aria-expanded={!collapsedCategories[domain.id]}
                  onClick={() => toggleCategory(domain.id)}
                >
                  <span className="math-worksheet-category-toggle__name">
                    <b>{categoryIndex + 1}</b>
                    <strong>{domain.name}</strong>
                  </span>
                  <i aria-hidden="true">{collapsedCategories[domain.id] ? "＋" : "−"}</i>
                </button>
                {!collapsedCategories[domain.id] ? (
                  <div>
                    {getMathQuestionTypesByCategory(domain.id).map((type) => {
                      const count = counts[type.id] ?? 0;
                      return (
                        <label className={count > 0 ? "is-selected" : ""} key={type.id}>
                          <input
                            type="checkbox"
                            checked={count > 0}
                            onChange={(event) => updateCount(type.id, event.target.checked ? Math.max(1, count) : 0)}
                          />
                          <b>{type.id}</b>
                          <span><strong>{type.name}</strong><small>难度 {type.difficultyRange[0]}–{type.difficultyRange[1]}</small></span>
                          <div>
                            <button type="button" disabled={count === 0} onClick={(event) => { event.preventDefault(); updateCount(type.id, count - 1); }}>−</button>
                            <input
                              aria-label={`${type.name}题目数量`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max={MAX_PER_TYPE}
                              value={count}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => updateCount(type.id, Number(event.target.value))}
                            />
                            <button type="button" disabled={count >= MAX_PER_TYPE || questions.length >= MAX_TOTAL} onClick={(event) => { event.preventDefault(); updateCount(type.id, count + 1); }}>＋</button>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="math-worksheet-config__footer">
            <label><input type="checkbox" checked={includeAnswers} onChange={(event) => setIncludeAnswers(event.target.checked)} />附带独立答案页</label>
            <button type="button" disabled={questions.length === 0} onClick={() => setSeed((value) => value + 1)}>换一套题</button>
            <button type="button" disabled={questions.length === 0} onClick={() => window.print()}>直接打印</button>
            <button className="is-primary" type="button" disabled={questions.length === 0 || Boolean(exportProgress)} onClick={() => void downloadPdf()}>
              {exportProgress || "下载 PDF"}
            </button>
            {error ? <p role="alert">{error}</p> : null}
          </div>
        </aside>

        <section className="math-worksheet-preview" aria-label="A4 练习卷预览">
          {questions.length === 0 ? (
            <div className="math-worksheet-empty"><MathPaperMascot /><strong>先勾选题型</strong><span>这里会立即显示 A4 练习卷预览。</span></div>
          ) : (
            <>
              {worksheetPages.map((items, index) => (
                <WorksheetPage title={title || "数学练习"} items={items} pageNumber={index + 1} totalPages={worksheetPages.length} key={`worksheet-${index}`} />
              ))}
              {answerPages.map((items, index) => (
                <AnswerPage title={title || "数学练习"} items={items} pageNumber={index + 1} totalPages={answerPages.length} key={`answers-${index}`} />
              ))}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
