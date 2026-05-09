const INDEX_URL = "data/index.json";
const CATEGORY_INDEX_URL = "data/categories/index.json";

const state = {
  payload: null,
  issues: [],
  articles: [],
  loadedIssues: new Map(),
  categoryIndex: null,
  loadedCategoryArticles: new Map(),
  categoryLoadPromises: new Map(),
  isLoadingIssue: false,
  isLoadingCorner: false,
  selectedIssueId: "all",
  selectedCategory: "all",
  cornerFilter: "all",
  selectedArticleId: null,
  viewMode: "issue",
  selectedCorner: "",
  query: "",
  isMobileIssuePanelOpen: false
};

const el = {
  heroMeta: document.querySelector("#heroMeta"),
  resultMeta: document.querySelector("#resultMeta"),
  articleList: document.querySelector("#articleList"),
  articleEmpty: document.querySelector("#articleEmpty"),
  articleView: document.querySelector("#articleView"),
  articleIssue: document.querySelector("#articleIssue"),
  articleCategory: document.querySelector("#articleCategory"),
  articleTitle: document.querySelector("#articleTitle"),
  articleAuthor: document.querySelector("#articleAuthor"),
  articleBody: document.querySelector("#articleBody"),
  articleSourceLink: document.querySelector("#articleSourceLink"),
  issuePdfLink: document.querySelector("#issuePdfLink"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  categoryField: document.querySelector("#categoryField"),
  cornerFilterSelect: document.querySelector("#cornerFilterSelect"),
  cornerFilterField: document.querySelector("#cornerFilterField"),
  tabIssue: document.querySelector("#tabIssue"),
  tabCorner: document.querySelector("#tabCorner"),
  listTitle: document.querySelector("#listTitle"),
  cornerList: document.querySelector("#cornerList"),
  mobileIssuePanelToggle: document.querySelector("#mobileIssuePanelToggle"),
  issuePanel: document.querySelector("#issuePanel"),
  readerPanel: document.querySelector(".reader-panel"),
  issueNav: document.querySelector("#issueNav"),
  prevIssueBtn: document.querySelector("#prevIssueBtn"),
  nextIssueBtn: document.querySelector("#nextIssueBtn"),
  issueSelect: document.querySelector("#issueSelect"),
  issueCoverWrap: document.querySelector("#issueCoverWrap"),
  issueCoverImg: document.querySelector("#issueCoverImg"),
  issueCoverToggle: document.querySelector("#issueCoverToggle"),
  quickNav: document.querySelector("#quickNav"),
  quickToListTopBtn: document.querySelector("#quickToListTopBtn"),
  quickToTopBtn: document.querySelector("#quickToTopBtn"),
  quickToMenuBtn: document.querySelector("#quickToMenuBtn")
};

boot();

async function boot() {
  updateIssueNavVisibility();
  bindEvents();
  await loadData();
  if (!state.payload) return;
  updateHero();
  renderIssueNav();
  renderIssuePdfLink();
  if (state.selectedIssueId && state.selectedIssueId !== "all") {
    await switchIssue(state.selectedIssueId);
  } else {
    renderCategoryOptions();
    renderArticleList();
    renderArticleDetail();
  }

  updateIssueNavVisibility();
}

function bindEvents() {
  el.mobileIssuePanelToggle.addEventListener("click", () => {
    setMobileIssuePanelOpen(!state.isMobileIssuePanelOpen);
  });

  el.prevIssueBtn.addEventListener("click", async () => {
    const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
    if (idx < state.issues.length - 1) await switchIssue(state.issues[idx + 1].webzineId);
  });

  el.nextIssueBtn.addEventListener("click", async () => {
    const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
    if (idx > 0) await switchIssue(state.issues[idx - 1].webzineId);
  });

  el.issueSelect.addEventListener("change", async () => {
    await switchIssue(el.issueSelect.value);
    if (window.innerWidth <= 1100) setMobileIssuePanelOpen(false);
  });

  el.issueCoverToggle.addEventListener("click", () => {
    const isHidden = el.issueCoverImg.hidden;
    el.issueCoverImg.hidden = !isHidden;
    el.issueCoverToggle.textContent = isHidden ? "표지 ▴" : "표지 ▾";
  });

  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value.trim().toLowerCase();
    renderArticleList();
  });

  el.categorySelect.addEventListener("change", () => {
    state.selectedCategory = el.categorySelect.value;
    renderArticleList();
  });

  el.cornerFilterSelect?.addEventListener("change", () => {
    // 코너 필터 변경 시 선택 코너를 필터 범위에 맞게 재설정.
    state.cornerFilter = el.cornerFilterSelect.value;
    const visibleCategories = getVisibleCornerCategories();
    const pinnedCorner = "도전님 훈시";
    if (state.cornerFilter !== "all") {
      // 특정 필터 선택 시 해당 코너를 우선 선택해 바로 내용을 확인할 수 있게 한다.
      state.selectedCorner = state.cornerFilter;
      state.selectedArticleId = null;
    } else if (!visibleCategories.includes(state.selectedCorner)) {
      state.selectedCorner = visibleCategories[0] || pinnedCorner;
      state.selectedArticleId = null;
    }

    renderCornerList();
    ensureSelectedCornerLoaded().then(() => {
      renderCornerList();
      renderArticleDetail();
    });
  });

  el.tabIssue.addEventListener("click", () => switchViewMode("issue"));
  el.tabCorner.addEventListener("click", () => switchViewMode("corner"));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100 && state.isMobileIssuePanelOpen) {
      setMobileIssuePanelOpen(false);
    }

    updateIssueNavVisibility();
    updateQuickNavVisibility();
  });

  // 본문이 길 때 빠른 이동 버튼 노출 상태를 스크롤에 맞춰 갱신한다.
  window.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.articleBody.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.articleList.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.issuePanel.addEventListener("scroll", updateQuickNavVisibility, { passive: true });

  el.quickToListTopBtn?.addEventListener("click", () => {
    scrollArticleListTop();
  });

  el.quickToTopBtn?.addEventListener("click", () => {
    scrollArticleTop();
  });

  el.quickToMenuBtn?.addEventListener("click", () => {
    scrollToTopMenu();
  });
}

function updateIssueNavVisibility() {
  const show = state.viewMode === "issue";
  el.issueNav.hidden = !show;
  el.issueNav.style.display = show ? "flex" : "none";
}

function setMobileIssuePanelOpen(isOpen) {
  state.isMobileIssuePanelOpen = isOpen;
  el.issuePanel.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("issue-panel-open", isOpen);
  el.mobileIssuePanelToggle.setAttribute("aria-expanded", String(isOpen));
  el.mobileIssuePanelToggle.textContent = isOpen ? "호수/코너 목록 닫기" : "호수/코너 목록 열기";
}

function scrollReaderIntoViewIfMobile() {
  if (window.innerWidth > 1100) {
    return;
  }

  // 모바일에서 기사 선택 시 목록 오버레이를 먼저 닫아 본문을 바로 볼 수 있게 한다.
  if (state.isMobileIssuePanelOpen) {
    setMobileIssuePanelOpen(false);
  }

  requestAnimationFrame(() => {
    el.readerPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function articleScrollTop() {
  if (window.innerWidth <= 1100) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  return el.articleBody?.scrollTop || 0;
}

function articleListScrollTop() {
  if (window.innerWidth <= 1100) {
    if (state.isMobileIssuePanelOpen) {
      return el.issuePanel?.scrollTop || 0;
    }
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  return el.articleList?.scrollTop || 0;
}

function updateQuickNavVisibility() {
  const hasArticle = !el.articleView.classList.contains("is-hidden");
  const shouldShow = articleScrollTop() > 220 || articleListScrollTop() > 220 || (hasArticle && articleScrollTop() > 120);
  if (el.quickNav) {
    el.quickNav.hidden = !shouldShow;
  }
}

function scrollArticleListTop() {
  if (window.innerWidth <= 1100) {
    if (state.isMobileIssuePanelOpen) {
      el.issuePanel?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    el.articleList?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  el.articleList?.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollArticleTop() {
  if (window.innerWidth <= 1100) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  el.articleBody?.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToTopMenu() {
  el.tabIssue?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (window.innerWidth > 1100) {
    el.articleBody?.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function loadData() {
  try {
    const response = await fetch(`${INDEX_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.payload = await response.json();
  } catch {
    el.heroMeta.textContent = "데이터 없음 · npm run build:data 를 먼저 실행해주세요.";
    return;
  }

  state.issues = Array.isArray(state.payload.issues) ? state.payload.issues : [];
  state.issues.sort((a, b) => b.issueNo - a.issueNo);

  if (state.issues[0]) {
    state.selectedIssueId = String(state.issues[0].webzineId);
  }
}

async function switchIssue(webzineId) {
  const key = String(webzineId);
  state.selectedIssueId = key;
  state.isLoadingIssue = true;
  updateIssueNavVisibility();
  renderIssueNav();
  renderCategoryOptions();
  renderIssuePdfLink();
  renderArticleList();

  await loadIssueData(key);

  state.articles = state.loadedIssues.get(key) || [];
  state.isLoadingIssue = false;

  if (!state.articles.some((a) => a.id === state.selectedArticleId)) {
    state.selectedArticleId = state.articles[0]?.id || null;
  }

  if (state.viewMode === "corner") renderCornerList();
  renderCategoryOptions();
  renderArticleList();
  renderArticleDetail();
}

async function loadIssueData(webzineId) {
  const key = String(webzineId);
  if (state.loadedIssues.has(key)) return;

  const issueMeta = state.issues.find((i) => String(i.webzineId) === key);
  if (!issueMeta?.filePath) return;

  const response = await fetch(`data/${issueMeta.filePath}?t=${Date.now()}`);
  const data = await response.json();
  const articles = data.articles.map((article) => ({
    ...article,
    issueId: key,
    issueNo: data.issueNo,
    issueLabel: data.issueLabel,
    issueDateLabel: data.dateLabel,
    coverUrl: data.coverUrl,
    searchBlob: `${article.title} ${article.author} ${article.category} ${article.bodyText}`.toLowerCase()
  }));
  articles.sort((a, b) => a.order - b.order);
  state.loadedIssues.set(key, articles);
}

function switchViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  // 코너별은 category index 로드 이후 기본 코너를 정한다.
  state.selectedCorner = "";
  state.selectedArticleId = null;
  // 모드 전환 즉시 툴바 필드를 강제 동기화해 코너 필터 노출 조건을 확실히 유지.
  if (el.cornerFilterField) {
    el.cornerFilterField.hidden = mode !== "corner";
  }
  if (el.categoryField) {
    el.categoryField.hidden = mode === "corner";
  }
  el.tabIssue.classList.toggle("is-active", mode === "issue");
  el.tabCorner.classList.toggle("is-active", mode === "corner");
  el.issuePanel.classList.toggle("is-corner-mode", mode === "corner");
  el.listTitle.textContent = mode === "corner" ? "코너별 제목" : "기사 목록";
  updateIssueNavVisibility();
  el.issueCoverWrap.hidden = mode === "corner" || !currentIssue()?.coverUrl;
  el.cornerList.hidden = mode === "issue";
  if (mode === "corner") {
    // 코너별 진입 시 카테고리 인덱스를 먼저 읽고, 선택 코너 목록을 로드한다.
    state.isLoadingCorner = true;
    renderCornerList();
    renderCategoryOptions();
    renderArticleList();
    renderArticleDetail();
    initializeCornerMode().then(() => {
      state.isLoadingCorner = false;
      renderCornerFilterOptions();
      renderCornerList();
      renderArticleList();
      renderArticleDetail();
    }).catch(() => {
      // categories 로드 실패 시 빈 목록 상태로 안전하게 복귀.
      state.isLoadingCorner = false;
      renderCornerFilterOptions();
      renderCornerList();
      renderArticleList();
      renderArticleDetail();
    });
  } else {
    renderIssueNav();
    renderCategoryOptions();
    renderIssuePdfLink();
    renderArticleList();
    renderArticleDetail();
  }
}

async function initializeCornerMode() {
  // 코너 목록과 선택 코너 기사 목록을 categories 데이터에서 초기화한다.
  await loadCategoryIndex();
  if (!state.selectedCorner) {
    state.selectedCorner = getDefaultCorner();
  }
  await ensureSelectedCornerLoaded();
}

async function loadCategoryIndex() {
  if (state.categoryIndex) {
    return;
  }

  const response = await fetch(`${CATEGORY_INDEX_URL}?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  state.categoryIndex = await response.json();
}

function getCategoryEntries() {
  const categories = state.categoryIndex?.categories;
  return Array.isArray(categories) ? categories : [];
}

function findCategoryEntryByName(categoryName) {
  return getCategoryEntries().find((entry) => entry.category === categoryName) || null;
}

async function loadCategoryArticlesByName(categoryName) {
  const normalized = String(categoryName || "").trim();
  if (!normalized) {
    return [];
  }

  if (state.loadedCategoryArticles.has(normalized)) {
    return state.loadedCategoryArticles.get(normalized) || [];
  }

  if (state.categoryLoadPromises.has(normalized)) {
    return state.categoryLoadPromises.get(normalized);
  }

  // 동일 카테고리 중복 요청을 방지하기 위해 Promise를 캐시한다.
  const loadPromise = (async () => {
    await loadCategoryIndex();
    const entry = findCategoryEntryByName(normalized);
    if (!entry?.filePath) {
      state.loadedCategoryArticles.set(normalized, []);
      return [];
    }

    const response = await fetch(`data/${entry.filePath}?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const articles = (Array.isArray(payload.articles) ? payload.articles : []).map((article) => ({
      ...article,
      searchBlob: `${article.title || ""} ${article.author || ""} ${article.category || ""} ${article.summary || ""}`.toLowerCase()
    }));
    state.loadedCategoryArticles.set(normalized, articles);
    return articles;
  })();

  state.categoryLoadPromises.set(normalized, loadPromise);

  try {
    return await loadPromise;
  } finally {
    state.categoryLoadPromises.delete(normalized);
  }
}

async function ensureSelectedCornerLoaded() {
  if (!state.selectedCorner) {
    return;
  }

  // 필터 모드에서는 도전님 훈시도 항상 펼치므로 함께 로드한다.
  const pinnedCorner = "도전님 훈시";
  const categoriesToLoad = state.cornerFilter !== "all"
    ? [...new Set([state.selectedCorner, pinnedCorner].filter(Boolean))]
    : [state.selectedCorner];

  const loadedLists = await Promise.all(categoriesToLoad.map((category) => loadCategoryArticlesByName(category)));
  const list = loadedLists[0] || [];
  if (!list.some((article) => article.id === state.selectedArticleId)) {
    state.selectedArticleId = list[0]?.id || null;
  }

  // 상세 본문은 기존 issue 파일에 있으므로 선택 기사의 원본 호수 데이터를 지연 로드한다.
  const selected = list.find((article) => article.id === state.selectedArticleId);
  if (selected?.webzineId) {
    await loadIssueData(String(selected.webzineId));
  }
}

function getCornerCategories() {
  // 코너 목록 정렬 규칙: 가나다순 + "도전님 훈시"를 항상 최상단으로 고정.
  const pinnedCorner = "도전님 훈시";
  const categories = [...new Set(getCategoryEntries().map((entry) => entry.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const pinnedIndex = categories.indexOf(pinnedCorner);
  if (pinnedIndex > 0) {
    categories.splice(pinnedIndex, 1);
    categories.unshift(pinnedCorner);
  }
  return categories;
}

function getVisibleCornerCategories() {
  // 코너 필터가 선택돼도 도전님 훈시는 항상 고정 노출한다.
  const pinnedCorner = "도전님 훈시";
  const categories = getCornerCategories();
  if (state.cornerFilter === "all") {
    return categories;
  }

  return categories.filter((category) => category === pinnedCorner || category === state.cornerFilter);
}

function shouldExpandCorner(category) {
  const pinnedCorner = "도전님 훈시";
  // 필터가 선택되면 도전님 훈시는 고정 펼침 + 선택 코너도 펼침.
  return state.selectedCorner === category || (state.cornerFilter !== "all" && category === pinnedCorner);
}

function getDefaultCorner() {
  // 기본 코너는 정렬/고정 규칙이 반영된 첫 번째 코너를 사용한다.
  const categories = getCornerCategories();
  return categories[0] || "";
}

function renderCornerList() {
  el.cornerList.innerHTML = "";
  // 아코디언: 각 코너 버튼 아래에 해당 코너의 제목 목록을 인라인으로 펼침.
  if (state.isLoadingCorner) {
    el.cornerList.innerHTML = `<div class="empty-state small">코너 목록을 불러오는 중입니다...</div>`;
    return;
  }

  const categories = getVisibleCornerCategories();

  if (categories.length === 0) {
    el.cornerList.innerHTML = `<div class="empty-state small">조건에 맞는 코너가 없습니다.<br>필터를 바꿔주세요.</div>`;
    return;
  }

  categories.forEach((cat) => {
    // 아코디언 항목 래퍼: 버튼 + 인라인 제목 목록
    const item = document.createElement("div");
    item.className = "corner-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `corner-card${state.selectedCorner === cat ? " is-active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      state.selectedCorner = cat;
      state.selectedArticleId = null;
      renderCornerList();
      renderArticleDetail();
      // 코너 클릭 시 해당 카테고리 기사 JSON을 비동기로 로드한다.
      ensureSelectedCornerLoaded().then(() => {
        renderCornerList();
        renderArticleDetail();
      });
      if (window.innerWidth <= 1100) {
        setMobileIssuePanelOpen(false);
      }
    });
    item.appendChild(btn);

    // 선택 코너 또는(필터 모드의) 도전님 훈시는 인라인 목록을 펼쳐 렌더링.
    if (shouldExpandCorner(cat)) {
      const inlineList = document.createElement("div");
      inlineList.className = "corner-inline-articles";
      renderCornerInlineArticles(cat, inlineList);
      item.appendChild(inlineList);
    }

    el.cornerList.appendChild(item);
  });
}

function renderCornerInlineArticles(cat, container) {
  // 코너 기사 4개 미리보기 + "+ 더 보기" 버튼 (category.asp 방식).
  const PREVIEW_COUNT = 4;
  const list = state.loadedCategoryArticles.get(cat);

  if (!list) {
    container.innerHTML = `<div class="empty-state small">목록을 불러오는 중입니다...</div>`;
    return;
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state small">해당 코너 기사가 없습니다.</div>`;
    return;
  }

  // 기사 행 생성 헬퍼
  function makeRow(article) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `corner-article-row${state.selectedArticleId === article.id ? " is-active" : ""}`;
    row.innerHTML = `
      <span class="corner-issue">${escapeHtml(article.issueLabel)}</span>
      <span class="corner-title">${escapeHtml(article.title)}</span>
    `;
    row.addEventListener("click", async () => {
      // 상세 본문 노출을 위해 기사가 속한 issue JSON을 먼저 로드한다.
      if (article.webzineId) {
        await loadIssueData(String(article.webzineId));
      }
      state.selectedArticleId = article.id;
      renderCornerList(); // 활성 행 강조 갱신
      renderArticleDetail();
      scrollReaderIntoViewIfMobile();
    });
    return row;
  }

  // 최초 4개 행 렌더링
  const preview = list.slice(0, PREVIEW_COUNT);
  preview.forEach((a) => container.appendChild(makeRow(a)));

  // 4개 초과분이 있으면 숨겨두고 "+ 더 보기" 버튼 표시
  const rest = list.slice(PREVIEW_COUNT);
  if (rest.length > 0) {
    // 나머지 행 컨테이너 (초기에는 숨김)
    const moreWrap = document.createElement("div");
    moreWrap.hidden = true;
    rest.forEach((a) => moreWrap.appendChild(makeRow(a)));
    container.appendChild(moreWrap);

    // "+ 더 보기 (N개)" 버튼
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "corner-more-btn";
    moreBtn.textContent = `+ 더 보기 (${rest.length}개)`;
    moreBtn.addEventListener("click", () => {
      moreWrap.hidden = false;  // 나머지 행 펼치기
      moreBtn.remove();          // 버튼 제거
    });
    container.appendChild(moreBtn);
  }
}

function hasUsablePdfUrl(url) {
  if (!url) {
    return false;
  }

  // Current scraped file.daesoon PDF URLs consistently return 404.
  if (/^https:\/\/file\.daesoon\.org\/webzine\/pdf\/hoebo\d+\.pdf$/i.test(url)) {
    return false;
  }

  return true;
}

function updateHero() {
  const issueCount = state.issues.length;
  const totalArticles = state.issues.reduce((sum, i) => sum + (i.articleCount || 0), 0);
  const generatedAt = state.payload?.generatedAt ? new Date(state.payload.generatedAt).toLocaleString("ko-KR") : "알 수 없음";
  el.heroMeta.textContent = `${issueCount}개 호, 총 ${totalArticles}개 기사 · 마지막 생성 ${generatedAt}`;
}

function renderIssueNav() {
  // select 옵션 채우기
  el.issueSelect.innerHTML = state.issues
    .map((issue) => `<option value="${escapeAttribute(String(issue.webzineId))}"${String(issue.webzineId) === state.selectedIssueId ? " selected" : ""}>${escapeHtml(issue.issueLabel)} · ${escapeHtml(issue.dateLabel)}</option>`)
    .join("");

  // 이전/다음 버튼 활성화 (issues는 최신순 정렬: [최신, ..., 오래된])
  const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
  el.prevIssueBtn.disabled = idx >= state.issues.length - 1; // 가장 오래된 호
  el.nextIssueBtn.disabled = idx <= 0;                       // 가장 최신 호

  // 표지 이미지
  const issue = currentIssue();
  if (issue?.coverUrl && state.viewMode === "issue") {
    el.issueCoverImg.src = issue.coverUrl;
    el.issueCoverImg.alt = `${issue.issueLabel} 표지`;
    el.issueCoverWrap.hidden = false;
  } else {
    el.issueCoverWrap.hidden = true;
  }
}

function renderCategoryOptions() {
  el.categoryField.hidden = state.viewMode === "corner";
  if (el.cornerFilterField) {
    el.cornerFilterField.hidden = state.viewMode !== "corner";
  }

  if (state.viewMode === "corner") {
    renderCornerFilterOptions();
    return;
  }

  const pinnedCorner = "도전님 훈시";
  const rawCategories = [...new Set(filteredArticlesForIssue().map((article) => article.category).filter(Boolean))];
  const sortedCategories = rawCategories
    .filter((category) => category !== pinnedCorner)
    .sort((left, right) => left.localeCompare(right, "ko"));
  // 호수별 모드: 도전님 훈시를 최상단에 고정하고 그 다음 전체, 나머지는 가나다순으로 배치.
  const categories = rawCategories.includes(pinnedCorner)
    ? [pinnedCorner, ...sortedCategories]
    : sortedCategories;
  const nextValue = categories.includes(state.selectedCategory) || state.selectedCategory === "all" ? state.selectedCategory : "all";
  state.selectedCategory = nextValue;
  const pinnedOption = rawCategories.includes(pinnedCorner)
    ? `<option value="${escapeAttribute(pinnedCorner)}">${escapeHtml(pinnedCorner)}</option>`
    : "";
  const otherOptions = sortedCategories
    .map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`)
    .join("");
  el.categorySelect.innerHTML = `${pinnedOption}<option value="all">전체</option>${otherOptions}`;
  el.categorySelect.value = state.selectedCategory;
}

function renderCornerFilterOptions() {
  if (!el.cornerFilterSelect) {
    return;
  }

  const pinnedCorner = "도전님 훈시";
  // 도전님 훈시는 필터 항목에서 제외하고 선택 목록만 제공한다.
  const filterOptions = getCornerCategories().filter((category) => category !== pinnedCorner);
  const nextValue = filterOptions.includes(state.cornerFilter) ? state.cornerFilter : "all";
  state.cornerFilter = nextValue;
  el.cornerFilterSelect.innerHTML = `<option value="all">전체 코너</option>${filterOptions.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`).join("")}`;
  el.cornerFilterSelect.value = state.cornerFilter;
}

function renderIssuePdfLink() {
  const issue = currentIssue();

  if (state.selectedIssueId === "all" || state.viewMode === "corner") {
    el.issuePdfLink.hidden = true;
    el.issuePdfLink.removeAttribute("href");
    return;
  }

  el.issuePdfLink.hidden = false;
  if (hasUsablePdfUrl(issue?.pdfUrl)) {
    el.issuePdfLink.href = issue.pdfUrl;
    el.issuePdfLink.textContent = "PDF 다운로드";
    el.issuePdfLink.classList.remove("is-disabled");
  } else {
    el.issuePdfLink.removeAttribute("href");
    el.issuePdfLink.textContent = "PDF 없음";
    el.issuePdfLink.classList.add("is-disabled");
  }
}

function renderArticleList() {
  // 코너별 모드: renderCornerList()가 아코디언 인라인 목록을 처리하므로 건너뜀.
  if (state.viewMode === "corner") {
    renderArticleDetail();
    return;
  }

  el.articleList.innerHTML = "";
  el.articleList.classList.remove("corner-article-list");

  if (state.viewMode === "issue" && state.selectedIssueId === "all") {
    el.resultMeta.textContent = "";
    el.articleList.innerHTML = `<div class="empty-state">← 호수를 선택하면 기사를 불러옵니다.</div>`;
    renderArticleDetail();
    return;
  }

  if (state.viewMode === "issue" && state.isLoadingIssue) {
    el.resultMeta.textContent = "불러오는 중...";
    el.articleList.innerHTML = `<div class="empty-state">기사를 불러오는 중입니다...</div>`;
    return;
  }

  if (state.viewMode === "corner" && !state.selectedCorner) {
    el.resultMeta.textContent = "";
    el.articleList.innerHTML = `<div class="empty-state">← 좌측에서 코너를 선택하면<br>호수별 제목이 표시됩니다.</div>`;
    state.selectedArticleId = null;
    renderArticleDetail();
    return;
  }

  const list = filteredArticles();
  el.resultMeta.textContent = state.viewMode === "corner" ? "" : `${list.length}개 기사`;

  if (list.length === 0) {
    const msg = state.viewMode === "corner" ? "불러온 호수에 해당 코너 기사가 없습니다." : "조건에 맞는 기사가 없습니다.";
    el.articleList.innerHTML = `<div class="empty-state">${msg}</div>`;
    state.selectedArticleId = null;
    renderArticleDetail();
    return;
  }

  if (!list.some((article) => article.id === state.selectedArticleId)) {
    state.selectedArticleId = list[0].id;
  }

  if (state.viewMode === "corner") {
    // 코너별 모드: 상단 헤더 + 호수/제목 행 리스트 형태로 렌더링.
    el.articleList.classList.add("corner-article-list");

    const header = document.createElement("div");
    header.className = "corner-article-head";
    header.innerHTML = `
      <strong>${escapeHtml(state.selectedCorner)} <span>(${list.length})</span></strong>
      <button type="button" class="corner-head-action">전체목록 보기</button>
    `;

    const clearBtn = header.querySelector(".corner-head-action");
    clearBtn?.addEventListener("click", () => {
      state.selectedCorner = getDefaultCorner();
      state.selectedArticleId = null;
      renderCornerList();
      renderArticleList();
      renderArticleDetail();
    });

    el.articleList.appendChild(header);
  }

  list.forEach((article) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = state.viewMode === "corner"
      ? `corner-article-row${state.selectedArticleId === article.id ? " is-active" : ""}`
      : `article-card${state.selectedArticleId === article.id ? " is-active" : ""}`;
    if (state.viewMode === "corner") {
      card.innerHTML = `
        <span class="corner-issue">${escapeHtml(article.issueLabel)}</span>
        <span class="corner-title">${escapeHtml(article.title)}</span>
      `;
    } else {
      card.innerHTML = `
        <div class="article-meta">${escapeHtml(article.issueLabel)} · ${escapeHtml(article.category || "미분류")}</div>
        <strong>${escapeHtml(article.title)}</strong>
        <div class="article-author">${escapeHtml(article.author || "필자 정보 없음")}</div>
        <p class="article-summary">${escapeHtml(article.summary)}</p>
      `;
    }
    card.addEventListener("click", () => {
      state.selectedArticleId = article.id;
      renderArticleList();
      renderArticleDetail();
      scrollReaderIntoViewIfMobile();
    });
    el.articleList.appendChild(card);
  });

  renderArticleDetail();
  updateQuickNavVisibility();
}

function findArticleById(id) {
  if (!id) return null;
  if (state.viewMode === "corner") {
    for (const articles of state.loadedIssues.values()) {
      const found = articles.find((a) => a.id === id);
      if (found) return found;
    }
    return null;
  }
  return state.articles.find((a) => a.id === id) || null;
}

function renderArticleDetail() {
  const article = findArticleById(state.selectedArticleId);
  if (!article) {
    el.articleEmpty.classList.remove("is-hidden");
    el.articleView.classList.add("is-hidden");
    updateQuickNavVisibility();
    return;
  }

  el.articleEmpty.classList.add("is-hidden");
  el.articleView.classList.remove("is-hidden");
  el.articleIssue.textContent = `${article.issueLabel} · ${article.issueDateLabel}`;
  el.articleCategory.textContent = article.category || "미분류";
  el.articleTitle.textContent = article.title;
  el.articleAuthor.textContent = article.author || "필자 정보 없음";
  el.articleSourceLink.href = article.sourceUrl;
  el.articleBody.innerHTML = article.bodyHtml || `<p>${escapeHtml(article.bodyText || "본문이 없습니다.")}</p>`;
  
  // 모바일 최적화: 기사 이미지에 lazy loading 적용
  const articleImages = el.articleBody.querySelectorAll('img');
  articleImages.forEach(img => {
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });

  updateQuickNavVisibility();
}

function currentIssue() {
  if (state.selectedIssueId === "all") {
    return null;
  }

  return state.issues.find((issue) => String(issue.webzineId) === state.selectedIssueId) || null;
}

function filteredArticlesForIssue() {
  if (state.viewMode === "corner") {
    if (!state.selectedCorner) {
      return [];
    }
    return state.loadedCategoryArticles.get(state.selectedCorner) || [];
  }
  return state.articles;
}

function filteredArticles() {
  return filteredArticlesForIssue().filter((article) => {
    if (state.viewMode === "issue" && state.selectedCategory !== "all" && article.category !== state.selectedCategory) {
      return false;
    }

    if (state.query && !article.searchBlob.includes(state.query)) {
      return false;
    }

    return true;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}